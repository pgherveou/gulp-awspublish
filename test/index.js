/* global describe, before, it */
'use strict';

var fs = require('fs'),
  path = require('path'),
  zlib = require('zlib'),
  chai = require('chai'),
  es = require('event-stream'),
  gutil = require('gulp-util'),
  clone = require('clone'),
  awspublish = require('../'),
  expect = chai.expect;

describe('gulp-awspublish', function () {

  this.timeout(10000);

  var credentials = JSON.parse(fs.readFileSync('aws-credentials.json', 'utf8')),
    publisher = awspublish.create(credentials);

  // remove files
  before(function (done) {
    try { fs.unlinkSync(path.join(__dirname, publisher.getCacheFilename())); } catch (err) { }
    try { fs.unlinkSync(path.join(__dirname, '../testCacheFile')); } catch (err) { }
    publisher._cache = {};

    var deleteParams = awspublish._buildDeleteMultiple([
      'test/hello.txt',
      'test/hello2.txt',
      'test/hello3.txt',
      'test/hello.txtgz'
    ]);

    publisher.client.deleteObjects(deleteParams, done);
  });

  after(function(){
    try { fs.unlinkSync(path.join(__dirname, publisher.getCacheFilename())); } catch (err) {}
    try { fs.unlinkSync(path.join(__dirname, '../testCacheFile')); } catch (err) { }
  });

  describe('Publish', function () {

    it('should emit error when using invalid bucket', function (done) {
      var badCredentials, badPublisher, stream;

      badCredentials = clone(credentials);
      badCredentials.params.Bucket = 'fake-bucket';
      badPublisher = awspublish.create(badCredentials),
        stream = badPublisher.publish();

      stream.on('error', function (err) {
        expect(err).to.be.ok;
        expect(err.statusCode).to.eq(403);
        done();
      });

      stream.write(new gutil.File({
        path: '/test/hello.txt',
        base: '/',
        contents: new Buffer('hello world 2')
      }));

      stream.end();
    });

    it('should produce gzip file with S3 headers', function (done) {

      var gzip = awspublish.gzip({ ext: '.gz' });
      var contents = new Buffer('hello world');
      var srcFile = new gutil.File({
        path: '/test/hello.txt',
        base: '/',
        contents: contents
      });

      gzip.write(srcFile);
      gzip
        .pipe(es.writeArray(function (err, files) {
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
        }));

      gzip.end();
    });

    it('should upload gzip file', function (done) {
      var gzip = awspublish.gzip({ ext: '.gz' }),
        stream = gzip.pipe(publisher.publish());


      gzip.write(new gutil.File({
        path: '/test/hello.txt',
        base: '/',
        contents: new Buffer('hello world')
      }));



      stream
        .pipe(es.writeArray(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(1);
          expect(files[0].s3.headers['Content-Type']).to.eq('text/plain; charset=utf-8');
          publisher.client.headObject({ Key: 'test/hello.txt.gz' }, function (err, res) {
            expect(res.ETag).to.exist;
            done(err);
          });
        }));

      gzip.end();


    });

    it('should create new file on s3 with headers', function (done) {

      var headers = {
        'Cache-Control': 'max-age=315360000, no-transform, public'
      };

      var stream = publisher.publish(headers);
      stream.write(new gutil.File({
        path: '/test/hello.txt',
        base: '/',
        contents: new Buffer('hello world')
      }));

      stream.write(new gutil.File({
        path: '/test/hello2.txt',
        base: '/',
        contents: new Buffer('hello world')
      }));

      stream
        .pipe(es.writeArray(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(2);
          expect(files[0].s3.path).to.eq('test/hello.txt');
          expect(files[0].s3.state).to.eq('create');
          expect(files[0].s3.headers['Cache-Control']).to.eq(headers['Cache-Control']);
          expect(files[0].s3.headers['x-amz-acl']).to.eq('public-read');
          expect(files[0].s3.headers['Content-Type']).to.eq('text/plain; charset=utf-8');
          expect(files[0].s3.headers['Content-Length']).to.eq(files[0].contents.length);
          publisher.client.headObject({ Key: 'test/hello.txt' }, function (err, res) {
            expect(res.ETag).to.exist;
            done(err);
          });
        }));

      stream.end();
    });

    it('should create new files on s3 with different headers', function (done) {

			var headers = {
				"Cache-Control": 'max-age=86400, no-transform, public',
				"fileFilters": [
					{
						"filter": '**/*.txt',
						"Cache-Control": 'max-age=604800, no-transform, public'
					},
					{
						"filter": ['**/*.jpg', '**/*.png'],
						"Cache-Control": 'max-age=315360000, no-transform, public'
					},
				]
			};

      var stream = publisher.publish(headers);
      stream.write(new gutil.File({
        path: '/test/hello3.txt',
        base: '/',
        contents: new Buffer('hello world')
      }));

      stream.write(new gutil.File({
        path: '/test/hello4.png',
        base: '/',
        contents: new Buffer('hello world')
      }));

      stream
        .pipe(es.writeArray(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(2);
          expect(files[0].s3.path).to.eq('test/hello3.txt');
          expect(files[0].s3.state).to.eq('create');
          expect(files[0].s3.headers['Cache-Control']).to.eq(headers.fileFilters[0]['Cache-Control']);
          expect(files[0].s3.headers['x-amz-acl']).to.eq('public-read');
          expect(files[0].s3.headers['Content-Type']).to.eq('text/plain; charset=utf-8');
          expect(files[0].s3.headers['Content-Length']).to.eq(files[0].contents.length);

          expect(files[1].s3.path).to.eq('test/hello4.png');
          expect(files[1].s3.state).to.eq('create');
          expect(files[1].s3.headers['Cache-Control']).to.eq(headers.fileFilters[1]['Cache-Control']);
          expect(files[1].s3.headers['x-amz-acl']).to.eq('public-read');
          expect(files[1].s3.headers['Content-Type']).to.eq('image/png');
          expect(files[1].s3.headers['Content-Length']).to.eq(files[1].contents.length);

          publisher.client.headObject({ Key: 'test/hello3.txt' }, function (err, res) {
            expect(res.ETag).to.exist;
            done(err);
          });
        }));

      stream.end();
    });

    it('should not send s3 header x-amz-acl if option {noAcl: true}', function (done) {

      var stream = publisher.publish({}, {noAcl: true});
      stream.write(new gutil.File({
        path: '/test/hello5.txt',
        base: '/',
        contents: new Buffer('hello world')
      }));

      stream
        .pipe(es.writeArray(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(1);
          expect(files[0].s3.path).to.eq('test/hello5.txt');
          expect(files[0].s3.state).to.eq('create');
          expect(files[0].s3.headers).not.contain.keys('x-amz-acl');
          expect(files[0].s3.headers['Content-Type']).to.eq('text/plain; charset=utf-8');
          expect(files[0].s3.headers['Content-Length']).to.eq(files[0].contents.length);
          publisher.client.headObject({ Key: 'test/hello5.txt' }, function (err, res) {
            expect(res.ETag).to.exist;
            done(err);
          });
        }));

      stream.end();
    });

    it('should update existing file on s3', function (done) {
      var stream = publisher.publish();
      stream.pipe(es.writeArray(function (err, files) {
        expect(err).not.to.exist;
        expect(files).to.have.length(1);
        expect(files[0].s3.state).to.eq('update');
        done(err);
      }));

      stream.write(new gutil.File({
        path: '/test/hello.txt',
        base: '/',
        contents: new Buffer('hello world 2')
      }));

      stream.end();
    });

    it('can skip updating an existing file on s3 (createOnly)', function (done) {
      var stream = publisher.publish({}, {
        createOnly: true
      });
      stream.pipe(es.writeArray(function (err, files) {
        expect(err).not.to.exist;
        expect(files).to.have.length(1);
        expect(files[0].s3.state).to.eq('skip');
        done(err);
      }));

      stream.write(new gutil.File({
        path: '/test/hello.txt',
        base: '/',
        contents: new Buffer('hello world 2')
      }));

      stream.end();
    });

    it('should skip file update', function (done) {
      var stream = publisher.publish();
      stream.pipe(es.writeArray(function (err, files) {
        expect(err).not.to.exist;
        expect(files).to.have.length(1);
        expect(files[0].s3.state).to.eq('skip');
        done(err);
      }));

      stream.write(new gutil.File({
        path: '/test/hello.txt',
        base: '/',
        contents: new Buffer('hello world 2')
      }));

      stream.end();
    });

    it('should have a the correct default cachefile name', function (done) {
      var publisherWithDefaultCache = awspublish.create(credentials),
        stream = publisherWithDefaultCache.publish(),
        cache = stream.pipe(publisherWithDefaultCache.cache());

      cache.on('finish', function () {
        expect(publisherWithDefaultCache._cacheFile).to.equal('.awspublish-' + credentials.params.Bucket)
        expect(fs.accessSync(path.join(__dirname, '../.awspublish-' + credentials.params.Bucket), fs.F_OK)).to.be.undefined;
        done();
      });

      stream.end();
    });

    it('should be able to use custom cachefile names', function (done) {
      var publisherWithCustomCache = awspublish.create(credentials, { cacheFileName: 'testCacheFile' }),
        stream = publisherWithCustomCache.publish(),
        cache = stream.pipe(publisherWithCustomCache.cache());

      cache.on('finish', function () {
        expect(publisherWithCustomCache._cacheFile).to.equal('testCacheFile');
        expect(fs.accessSync(path.join(__dirname, '../testCacheFile'), fs.F_OK)).to.be.undefined;
        done();
      });

      stream.end();
    });

    it('should be able to use the cache', function (done) {
      var stream = publisher.publish(),
        cache = stream.pipe(publisher.cache());

      stream.write(new gutil.File({
        path: '/test/hello.txt',
        base: '/',
        contents: new Buffer('hello world 2')
      }));

      cache.on('finish', function () {
        expect(publisher._cache).to.have.ownProperty('test/hello.txt');
        done();
      });

      stream.end();
    });

    it('should mark file as cached', function (done) {
      var stream = publisher.publish();
      stream.pipe(es.writeArray(function (err, files) {
        expect(err).not.to.exist;
        expect(files).to.have.length(1);
        expect(files[0].s3.state).to.eq('cache');
        done(err);
      }));

      stream.write(new gutil.File({
        path: '/test/hello.txt',
        base: '/',
        contents: new Buffer('hello world 2')
      }));

      stream.end();
    });

    it('should force upload', function (done) {
      var stream = publisher.publish({}, { force: true });
      stream.pipe(es.writeArray(function (err, files) {
        expect(err).not.to.exist;
        expect(files).to.have.length(1);
        expect(files[0].s3.state).to.eq('update');
        done(err);
      }));

      stream.write(new gutil.File({
        path: '/test/hello.txt',
        base: '/',
        contents: new Buffer('hello world 2')
      }));

      stream.end();
    });

    it('should simulate file upload on s3', function (done) {
      var stream = publisher.publish(null, { simulate: true });
      stream.write(new gutil.File({
        path: '/test/simulate.txt',
        base: '/',
        contents: new Buffer('simulate')
      }));

      stream
        .pipe(es.writeArray(function (err, files) {
          expect(err).not.to.exist;
          expect(files).to.have.length(1);
          expect(files[0].s3.path).to.eq('test/simulate.txt');
          publisher.client.headObject({ Key: '/test/simulate.txt' }, function (err) {
            expect(err.statusCode).to.eq(404);
            done();
          });
        }));

      stream.end();
    });
  });

  describe('Sync', function () {

    // remove files
    before(function (done) {
      var deleteParams = awspublish._buildDeleteMultiple([
        'test/hello.txt',
        'test/hello2.txt',
        'test/hello3.txt',
        'test/hello4.png',
        'test/hello5.txt',
        'test/hello.txtgz',
        'test/hello.txt.gz'
      ]);
      publisher.client.deleteObjects(deleteParams, done);
    });

    // add some dummy file
    ['bar', 'foo/1', 'foo/2', 'foo/3'].forEach(function (name) {

      var file = {
        s3: {
          path: name + '.txt',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        },
        contents: new Buffer('hello world')
      };

      beforeEach(function (done) {
        var params = awspublish._toAwsParams(file);
        publisher.client.putObject(params, done);
      });
    });

    it('should sync bucket with published data', function (done) {
      var stream = gutil.noop();

      stream
        .pipe(publisher.sync('foo'))
        .pipe(es.writeArray(function (err, arr) {
          expect(err).to.not.exist;
          var deleted = arr.filter(function (file) {
            return file.s3 && file.s3.state === 'delete';
          }).map(function (file) {
            return file.s3.path;
          }).sort().join(' ');

          expect(deleted).to.eq('foo/2.txt foo/3.txt');
          done(err);
        }));

      stream.write({ s3: { path: 'foo/1.txt' } });
      stream.end();
    });

    it('should not delete files that match a whitelist regex', function (done) {
      var stream = gutil.noop();

      stream
        .pipe(publisher.sync('', [/foo/]))
        .pipe(es.writeArray(function (err, arr) {
          expect(err).to.not.exist;

          var deleted = arr.filter(function (file) {
            return file.s3 && file.s3.state === 'delete';
          })

          // foo/1.txt should not be deleted because it was in the stream
          // foo/2.txt foo/3.txt should not be deleted because they match against the regex in the whitelist
          // bar should be deleted
          expect(deleted.length).to.eq(1);
          done(err);
        }));

      stream.write({ s3: { path: 'foo/1.txt' } });
      stream.end();
    });

    it('should not delete files that match a whitelist string', function (done) {
      var stream = gutil.noop();

      stream
        .pipe(publisher.sync('', ['foo/2.txt', 'fooo/3.txt']))
        .pipe(es.writeArray(function (err, arr) {
          expect(err).to.not.exist;

          var deleted = arr.filter(function (file) {
            return file.s3 && file.s3.state === 'delete';
          })

          // foo/1.txt should not be deleted because it was in the stream
          // foo/2.txt should not be deleted because it was in the whitelist
          // bar and foo/3.txt should be deleted
          expect(deleted.length).to.eq(2);
          done(err);
        }));

      stream.write({ s3: { path: 'foo/1.txt' } });
      stream.end();
    });
  });
});
