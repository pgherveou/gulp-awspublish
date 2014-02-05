var Stream = require('stream'),
    fs = require('fs'),
    through = require('through2'),
    zlib = require('zlib'),
    crypto = require('crypto'),
    knox = require('knox'),
    mime = require('mime'),
    gutil = require('gulp-util');

/**
 * calculate file hash
 * @param  {Buffer} buf
 * @return {String}
 *
 * @api private
 */

function md5Hash(buf) {
  return crypto
    .createHash('md5')
    .update(buf)
    .digest('hex');
}

/**
 * init file s3 hash
 * @param  {Vinyl} file file object
 *
 * @return {Vinyl} file
 * @api private
 */

function initFile(file) {
  if (!file.s3) {
    file.s3 = {};
    file.s3.headers = {};
    file.s3.path = file.path.replace(file.base, '');
  }
  return file;
}

/**
 * create a through stream that gzip files
 * file content is gziped and Content-Encoding is added to s3.headers
 * @param  {Object} param
 *
 * @return {Stream}
 * @api public
 */

module.exports.gzip = function() {
  return through.obj(function (file, enc, cb) {

    // Do nothing if no contents
    if (file.isNull()) return cb();

    // streams not supported
    if (file.isStream()) {
      this.emit('error',
        new gutil.PluginError('gulp-awspublish', 'Stream content is not supported'));
      return cb();
    }

    // check if file.contents is a `Buffer`
    if (file.isBuffer()) {

      file = initFile(file.clone());

      // add content-type header
      file.s3.headers['Content-Encoding'] = 'gzip';

      // zip file
      zlib.gzip(file.contents, function(err, buf) {
        if (err) return cb(err);
        file.path += 'gz';
        file.s3.path += 'gz';
        file.contents = buf;
        cb(err, file);
      });
    }
  });
};

/**
 * create a through stream that print s3 status info
 *
 * @return {Stream}
 * @api public
 */

module.exports.reporter = function() {
  return require('./log-reporter')();
};

/**
 * create a new Publisher
 * @see Knox.createClient()
 * @param {Object} knox option object
 *
 * options keys are:
 *   key: amazon key,
 *   secret: amazon secret,
 *   bucket: amazon bucket
 *
 * @api private
 */

function Publisher(config) {
  var filename = '.awspublish-' + config.bucket;

  // create client
  this.client = knox.createClient(config);

  // load cache
  try {
    this._cache = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch (err) {
    this._cache = {};
  }
}

/**
 * save cache file to disk
 *
 * @api privare
 */

Publisher.prototype.saveCache = function() {
  var filename = '.awspublish-' + this.client.bucket;
  fs.writeFileSync(filename, JSON.stringify(this._cache));
};

/**
 * create a through stream that save file etag in cache
 *
 * @return {Stream}
 * @api public
 */

Publisher.prototype.cache = function() {
  var _this = this,
      counter = 0;

  var stream = through.obj(function (file, enc, cb) {
    if (file.s3 && file.s3.path) {
      if (file.s3.state === 'delete') {
        delete _this._cache[file.s3.path];
      } else if (file.s3.etag) {
        _this._cache[file.s3.path] = file.s3.etag;
      }
    }

    // save cache every 10 files
    if (++counter % 10) _this.saveCache();

    cb(null, file);
  });

  stream.on('finish', function() {
    _this.saveCache();
  });

  return stream;
};


/**
 * create a through stream that publish files to s3
 * @headers {Object} headers additional headers to add to s3
 *
 * @return {Stream}
 * @api public
 */

Publisher.prototype.publish = function (headers) {

  var _this = this;

  // init param object
  if (!headers) headers = {};

  // add public-read header by default
  if(!headers['x-amz-acl']) headers['x-amz-acl'] = 'public-read';

  return through.obj(function (file, enc, cb) {
    var header, etag;

    // Do nothing if no contents
    if (file.isNull()) return cb();

    // streams not supported
    if (file.isStream()) {
      this.emit('error',
        new gutil.PluginError('gulp-awspublish', 'Stream content is not supported'));
      return cb();
    }

    // check if file.contents is a `Buffer`
    if (file.isBuffer()) {

      file = initFile(file);

      // calculate etag
      etag = '"' + md5Hash(file.contents) + '"';

      // file is marked as delete - stop here
      if (file.s3.state === 'delete') return cb(null, file);

      // check if file is identical as the one in cache
      if (_this._cache[file.s3.path] === etag) {
        file.s3.state = 'cache';
        return cb(null, file);
      }

      // add content-type header
      file.s3.headers['Content-Type'] = mime.lookup(file.path);

      // add content-length header
      file.s3.headers['Content-Length'] = file.contents.length;

      // add extra headers
      for (header in headers) file.s3.headers[header] = headers[header];

      // get s3 headers
      _this.client.headFile(file.s3.path, function(err, res) {
        if (err) return cb(err);

        // skip: file are identical
        if (res.headers.etag === etag) {
          file.s3.state = 'skip';
          file.s3.etag = etag;
          cb(err, file);

        // update: file are different
        } else {
          file.s3.state = res.headers.etag
            ? 'update'
            : 'create';

          _this.client.putBuffer(file.contents, file.s3.path, file.s3.headers, function(err) {
            if (!err) file.s3.etag = etag;
            cb(err, file);
          });
        }
      });
    }
  });
};

/**
 * Sync file in stream with file in the s3 bucket
 *
 * @return {Stream} a transform stream that stream both new files and delete files
 * @api public
 */

Publisher.prototype.sync = function() {
  var client = this.client,
      stream = new Stream.Transform({ objectMode : true }),
      newFiles = [],
      existings;

  // compare newfiles and existings
  // and delete old files from bucket
  function cleanup(cb) {

    // get old files
    var oldS3paths = existings.filter(function (file) {
      return newFiles.indexOf(file) === -1;
    });

    // push old files in the stream
    oldS3paths.forEach(function (s3path) {
      var file = new gutil.File({});
      file.s3 = {path: s3path, state: 'delete', headers: {} };
      stream.push(file);
    });

    // delete old files from bucket
    client.deleteMultiple(oldS3paths, cb);
  }

  // push file to stream and add files to s3 path to list of new files
  stream._transform = function(file, encoding, cb) {
    newFiles.push(file.s3.path);
    this.push(file);
    cb();
  };

  // figure out what are the old files
  // cleanup and add deleted file to stream
  stream._flush = function(cb) {

    // get actual
    client.list({}, function(err, data) {
      if (err) return cb(err);

      // get file in the s3 bucket
      existings = data.Contents.map(function(item) { return item.Key; });

      // clean up files
      cleanup(cb);
    });
  };

  return stream;
};

/**
 * Shortcut for `new Publisher()`.
 *
 * @param {Object} options
 * @return {Publisher}
 *
 * @api public
 */

exports.create = function(options){
  return new Publisher(options);
};
