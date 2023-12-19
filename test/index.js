'use strict';

const { Transform, Writable } = require('stream');

var fs = require('fs'),
  path = require('path'),
  zlib = require('zlib'),
  chai = require('chai'),
  Vinyl = require('vinyl'),
  awspublish = require('../'),
  expect = chai.expect;

// Inspired by writeArray() of event-stream package
// All files are stored in an array, which is passed to the callback when the stream ends.
function collectFiles(callback) {
  const writable = new Writable({ objectMode: true });
  const files = [];
  let done = false;

  writable.write = function (file) {
    files.push(file);
  };
  writable.end = function () {
    done = true;
    callback(null, files);
  };
  writable.destroy = function () {
    if (done) return;
    callback(new Error('destroy() before end()'), files);
  };

  return writable;
}

// Inspired by obj() of through2 package
function createTransform() {
  const stream = new Transform({ objectMode: true });
  stream._transform = (chunk, enc, cb) => cb(null, chunk);
  return stream;
}

describe('gulp-awspublish', function () {
  this.timeout(10000);

  var credentials = getCredentials(),
    publisher = awspublish.create(credentials);

  function getCredentials() {
    return process.env.TRAVIS
      ? {
          params: {
            Bucket: process.env.bucket + '-' + process.env.TRAVIS_NODE_VERSION,
          },
          credentials: {
            accessKeyId: process.env.accessKeyId,
            secretAccessKey: process.env.secretAccessKey,
            signatureVersion: 'v3',
          },
        }
      : JSON.parse(fs.readFileSync('aws-credentials.json', 'utf8'));
  }

  // remove files
  before(function (done) {
    try {
      fs.unlinkSync(path.join(__dirname, '..', publisher.getCacheFilename()));
    } catch (err) {}
    try {
      fs.unlinkSync(path.join(__dirname, '..', 'testCacheFile'));
    } catch (err) {}
    publisher._cache = {};

    var deleteParams = awspublish._buildDeleteMultiple(
      publisher.client.config.params.Bucket,
      [
        'test/hello.txt',
        'test/hello2.txt',
        'test/hello3.txt',
        'test/hello.txtgz',
      ]
    );

    publisher.client.deleteObjects(deleteParams[0], done);
  });

  after(function () {
    try {
      fs.unlinkSync(path.join(__dirname, '..', publisher.getCacheFilename()));
    } catch (err) {}
    try {
      fs.unlinkSync(path.join(__dirname, '..', 'testCacheFile'));
    } catch (err) {}
  });

  describe('Publish', function () {
    it('should emit error when using invalid bucket', function (done) {
      var badCredentials, badPublisher, stream;

      badCredentials = getCredentials(credentials);
      badCredentials.params.Bucket = 'fake-bucket';
      (badPublisher = awspublish.create(badCredentials)),
        (stream = badPublisher.publish());

      stream.on('error', function (err) {
        expect(err).to.be.ok;
        expect(err.$response.statusCode).to.eq(403);
        done();
      });

      stream.write(
        new Vinyl({
          path: '/test/hello.txt',
          base: '/',
          contents: Buffer.from('hello world 2'),
        })
      );

      stream.end();
    });

    it('should produce gzip file with S3 headers', function (done) {
      var gzip = awspublish.gzip({ ext: '.gz' });
      var contents = Buffer.from('hello world');
      var srcFile = new Vinyl({
        path: '/test/hello.txt',
        base: '/',
        contents: contents,
      });

      gzip.write(srcFile);
      gzip.pipe(
        collectFiles(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(1);
          expect(files[0].path).to.eq('/test/hello.txt.gz');
          expect(files[0].unzipPath).to.eq('/test/hello.txt');
          expect(files[0].s3.path).to.eq('test/hello.txt.gz');
          expect(files[0].s3.headers['Content-Encoding']).to.eq('gzip');

          // compare uncompressed to srcFile
          zlib.unzip(files[0].contents, function (err, buf) {
            var newFileContent = buf.toString('utf8', 0, buf.length),
              srcFileContent = contents.toString('utf8', 0, contents.length);
            expect(newFileContent).to.eq(srcFileContent);
            done();
          });
        })
      );

      gzip.end();
    });

    it('should upload gzip file', function (done) {
      var gzip = awspublish.gzip({ ext: '.gz' }),
        stream = gzip.pipe(publisher.publish());

      gzip.write(
        new Vinyl({
          path: '/test/hello.txt',
          base: '/',
          contents: Buffer.from('hello world'),
        })
      );

      stream.pipe(
        collectFiles(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(1);
          expect(files[0].s3.headers['Content-Type']).to.eq(
            'text/plain; charset=utf-8'
          );
          publisher.client.headObject(
            {
              Bucket: publisher.client.config.params.Bucket,
              Key: 'test/hello.txt.gz',
            },
            function (err, res) {
              expect(res.ETag).to.exist;
              done(err);
            }
          );
        })
      );

      gzip.end();
    });

    it('should consider size of gzip files with smaller', function (done) {
      var gzip = awspublish.gzip({ ext: '.gz', smaller: true });
      gzip.write(
        new Vinyl({
          path: '/test/hello.txt',
          base: '/',
          contents: Buffer.from(''), // zero-length file is always larger compressed
        })
      );
      var hello2 = Buffer.from('hello world'.repeat(10));
      gzip.write(
        new Vinyl({
          path: '/test/hello2.txt',
          base: '/',
          contents: hello2,
        })
      );

      gzip.pipe(
        collectFiles(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(2);

          expect(files[0].path).to.eq('/test/hello.txt');
          expect(files[0].unzipPath).not.to.exist;
          expect(files[0].s3.path).to.eq('test/hello.txt');
          expect(files[0].s3.headers['Content-Encoding']).not.to.exist;
          expect(files[0].contents.length).to.eq(0);

          expect(files[1].path).to.eq('/test/hello2.txt.gz');
          expect(files[1].unzipPath).to.eq('/test/hello2.txt');
          expect(files[1].s3.path).to.eq('test/hello2.txt.gz');
          expect(files[1].s3.headers['Content-Encoding']).to.eq('gzip');
          expect(files[1].contents.length).to.be.lt(hello2.length);

          done();
        })
      );

      gzip.end();
    });

    it('should create new file on s3 with headers', function (done) {
      var headers = {
        'Cache-Control': 'max-age=315360000, no-transform, public',
      };

      var stream = publisher.publish(headers);
      stream.write(
        new Vinyl({
          path: '/test/hello.txt',
          base: '/',
          contents: Buffer.from('hello world'),
        })
      );

      stream.write(
        new Vinyl({
          path: '/test/hello2.txt',
          base: '/',
          contents: Buffer.from('hello world'),
        })
      );

      stream.pipe(
        collectFiles(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(2);
          expect(files[0].s3.path).to.eq('test/hello.txt');
          expect(files[0].s3.state).to.eq('create');
          expect(files[0].s3.headers['Cache-Control']).to.eq(
            headers['Cache-Control']
          );
          expect(files[0].s3.headers).not.contain.keys('x-amz-acl');
          expect(files[0].s3.headers['Content-Type']).to.eq(
            'text/plain; charset=utf-8'
          );
          expect(files[0].s3.headers['Content-Length']).to.eq(
            files[0].contents.length
          );
          publisher.client.headObject(
            {
              Bucket: publisher.client.config.params.Bucket,
              Key: 'test/hello.txt',
            },
            function (err, res) {
              expect(res.ETag).to.exist;
              done(err);
            }
          );
        })
      );

      stream.end();
    });

    it('should not send s3 header x-amz-acl by default', function (done) {
      var stream = publisher.publish({});
      stream.write(
        new Vinyl({
          path: '/test/hello3.txt',
          base: '/',
          contents: Buffer.from('hello world'),
        })
      );

      stream.pipe(
        collectFiles(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(1);
          expect(files[0].s3.path).to.eq('test/hello3.txt');
          expect(files[0].s3.state).to.eq('create');
          expect(files[0].s3.headers).not.contain.keys('x-amz-acl');
          expect(files[0].s3.headers['Content-Type']).to.eq(
            'text/plain; charset=utf-8'
          );
          expect(files[0].s3.headers['Content-Length']).to.eq(
            files[0].contents.length
          );
          publisher.client.headObject(
            {
              Bucket: publisher.client.config.params.Bucket,
              Key: 'test/hello.txt',
            },
            function (err, res) {
              expect(res.ETag).to.exist;
              done(err);
            }
          );
        })
      );

      stream.end();
    });

    it('should update existing file on s3', function (done) {
      var stream = publisher.publish();
      stream.pipe(
        collectFiles(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(1);
          expect(files[0].s3.state).to.eq('update');
          done(err);
        })
      );

      stream.write(
        new Vinyl({
          path: '/test/hello.txt',
          base: '/',
          contents: Buffer.from('hello world 2'),
        })
      );

      stream.end();
    });

    it('can skip updating an existing file on s3 (createOnly)', function (done) {
      var stream = publisher.publish(
        {},
        {
          createOnly: true,
        }
      );
      stream.pipe(
        collectFiles(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(1);
          expect(files[0].s3.state).to.eq('skip');
          done(err);
        })
      );

      stream.write(
        new Vinyl({
          path: '/test/hello.txt',
          base: '/',
          contents: Buffer.from('hello world 2'),
        })
      );

      stream.end();
    });

    it('should skip file update', function (done) {
      var stream = publisher.publish();
      stream.pipe(
        collectFiles(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(1);
          expect(files[0].s3.state).to.eq('skip');
          done(err);
        })
      );

      stream.write(
        new Vinyl({
          path: '/test/hello.txt',
          base: '/',
          contents: Buffer.from('hello world 2'),
        })
      );

      stream.end();
    });

    it('should put object without head object', function (done) {
      var stream = publisher.publish({}, { putOnly: true });
      stream.pipe(
        collectFiles(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(1);
          expect(files[0].s3.state).to.eq('put');
          done(err);
        })
      );

      stream.write(
        new Vinyl({
          path: '/test/hello.txt',
          base: '/',
          contents: Buffer.from('hello world'),
        })
      );

      stream.end();
    });

    it('should have a the correct default cachefile name', function (done) {
      var publisherWithDefaultCache = awspublish.create(credentials),
        stream = publisherWithDefaultCache.publish(),
        cache = stream.pipe(publisherWithDefaultCache.cache());

      cache.on('finish', function () {
        expect(publisherWithDefaultCache._cacheFile).to.equal(
          '.awspublish-' + credentials.params.Bucket
        );
        expect(
          fs.accessSync(
            path.join(
              __dirname,
              '..',
              '.awspublish-' + credentials.params.Bucket
            ),
            fs.F_OK
          )
        ).to.be.undefined;
        done();
      });

      stream.end();
    });

    it('should be able to use custom cachefile names', function (done) {
      var publisherWithCustomCache = awspublish.create(credentials, {
          cacheFileName: 'testCacheFile',
        }),
        stream = publisherWithCustomCache.publish(),
        cache = stream.pipe(publisherWithCustomCache.cache());

      cache.on('finish', function () {
        expect(publisherWithCustomCache._cacheFile).to.equal('testCacheFile');
        expect(
          fs.accessSync(path.join(__dirname, '..', 'testCacheFile'), fs.F_OK)
        ).to.be.undefined;
        done();
      });

      stream.end();
    });

    it('should be able to use the cache', function (done) {
      var stream = publisher.publish(),
        cache = stream.pipe(publisher.cache());

      stream.write(
        new Vinyl({
          path: '/test/hello.txt',
          base: '/',
          contents: Buffer.from('hello world 2'),
        })
      );

      cache.on('finish', function () {
        expect(publisher._cache).to.have.ownProperty('test/hello.txt');
        done();
      });

      stream.end();
    });

    it('should mark file as cached', function (done) {
      var stream = publisher.publish();
      stream.pipe(
        collectFiles(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(1);
          expect(files[0].s3.state).to.eq('cache');
          done(err);
        })
      );

      stream.write(
        new Vinyl({
          path: '/test/hello.txt',
          base: '/',
          contents: Buffer.from('hello world 2'),
        })
      );

      stream.end();
    });

    it('should force upload', function (done) {
      var stream = publisher.publish({}, { force: true });
      stream.pipe(
        collectFiles(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(1);
          expect(files[0].s3.state).to.eq('update');
          done(err);
        })
      );

      stream.write(
        new Vinyl({
          path: '/test/hello.txt',
          base: '/',
          contents: Buffer.from('hello world 2'),
        })
      );

      stream.end();
    });

    it('should simulate file upload on s3', function (done) {
      var stream = publisher.publish(null, { simulate: true });
      stream.write(
        new Vinyl({
          path: '/test/simulate.txt',
          base: '/',
          contents: Buffer.from('simulate'),
        })
      );

      stream.pipe(
        collectFiles(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(1);
          expect(files[0].s3.path).to.eq('test/simulate.txt');
          publisher.client.headObject(
            {
              Bucket: publisher.client.config.params.Bucket,
              Key: '/test/simulate.txt',
            },
            function (err) {
              expect(err.$response.statusCode).to.eq(404);
              done();
            }
          );
        })
      );

      stream.end();
    });

    it('should publish files with unknown extension', function (done) {
      var stream = publisher.publish();
      stream.pipe(
        collectFiles(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(1);
          expect(files[0].s3.path).to.eq('test/hello.unknown');
          expect(files[0].s3.headers['Content-Type']).to.eq(
            'application/octet-stream'
          );
          expect(files[0].s3.headers['Content-Length']).to.eq(
            files[0].contents.length
          );
          done(err);
        })
      );

      stream.write(
        new Vinyl({
          path: '/test/hello.unknown',
          base: '/',
          contents: Buffer.from('hello world'),
        })
      );

      stream.end();
    });
  });

  describe('Sync', function () {
    // remove files
    before(function (done) {
      var deleteParams = awspublish._buildDeleteMultiple(
        publisher.client.config.params.Bucket,
        [
          'test/hello.txt',
          'test/hello2.txt',
          'test/hello3.txt',
          'test/hello.txtgz',
          'test/hello.txt.gz',
          'test/hello.unknown',
        ]
      );
      publisher.client.deleteObjects(deleteParams[0], done);
    });

    // add some dummy file
    ['bar', 'foo/1', 'foo/2', 'foo/3'].forEach(function (name) {
      var file = {
        s3: {
          path: name + '.txt',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        },
        contents: Buffer.from('hello world'),
      };

      beforeEach(function (done) {
        var params = awspublish._toAwsParams(
          publisher.client.config.params.Bucket,
          file
        );
        publisher.client.putObject(params, done);
      });
    });

    it('should sync bucket with published data', function (done) {
      var stream = createTransform();

      stream.pipe(publisher.sync('foo')).pipe(
        collectFiles(function (err, arr) {
          expect(err).to.not.exist;
          var deleted = arr
            .filter(function (file) {
              return file.s3 && file.s3.state === 'delete';
            })
            .map(function (file) {
              return file.s3.path;
            })
            .sort()
            .join(' ');

          expect(deleted).to.eq('foo/2.txt foo/3.txt');
          done(err);
        })
      );

      stream.write({ s3: { path: 'foo/1.txt' } });
      stream.end();
    });

    it('should not delete files that match a whitelist regex', function (done) {
      var stream = createTransform();

      stream.pipe(publisher.sync('', [/foo/])).pipe(
        collectFiles(function (err, arr) {
          expect(err).to.not.exist;

          var deleted = arr.filter(function (file) {
            return file.s3 && file.s3.state === 'delete';
          });

          // foo/1.txt should not be deleted because it was in the stream
          // foo/2.txt foo/3.txt should not be deleted because they match against the regex in the whitelist
          // bar should be deleted
          expect(deleted.length).to.eq(1);
          done(err);
        })
      );

      stream.write({ s3: { path: 'foo/1.txt' } });
      stream.end();
    });

    it('should not delete files that match a whitelist string', function (done) {
      var stream = createTransform();

      stream.pipe(publisher.sync('', ['foo/2.txt', 'fooo/3.txt'])).pipe(
        collectFiles(function (err, arr) {
          expect(err).to.not.exist;

          var deleted = arr.filter(function (file) {
            return file.s3 && file.s3.state === 'delete';
          });

          // foo/1.txt should not be deleted because it was in the stream
          // foo/2.txt should not be deleted because it was in the whitelist
          // bar and foo/3.txt should be deleted
          expect(deleted.length).to.eq(2);
          done(err);
        })
      );

      stream.write({ s3: { path: 'foo/1.txt' } });
      stream.end();
    });
    it('chunks file deletion requests into 1K chunks', function () {
      var res = awspublish._buildDeleteMultiple(
        publisher.client.config.params.Bucket,
        new Array(1001).fill('test')
      );
      expect(res.length).to.eq(2);
      expect(res[1].Delete.Objects.length).to.eq(1);
    });
  });
});
