var AWS = require('aws-sdk'),
    converter = require('xml-json'),
    Stream = require('stream'),
    fs = require('fs'),
    through = require('through2'),
    zlib = require('zlib'),
    crypto = require('crypto'),
    mime = require('mime'),
    pascalCase = require('pascal-case'),
    File = require('vinyl'),
    gutil = require('gulp-util');

var PLUGIN_NAME = 'gulp-awspublish';

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
 * Determine the content type of a file based on charset and mime type.
 * @param  {Object} file
 * @return {String}
 *
 * @api private
 */

function getContentType(file) {
  var mimeType = mime.lookup(file.unzipPath || file.path);
  var charset = mime.charsets.lookup(mimeType);

  return charset
    ? mimeType + '; charset=' + charset.toLowerCase()
    : mimeType;
}

/**
 * Turn the HTTP style headers into AWS Object params
 */

function toAwsParams(file) {
  var params = {};

  var headers = file.s3.headers || {};

  for (var header in headers) {
    if (header === 'x-amz-acl') {

      params.ACL = headers[header];

    } else {

      params[pascalCase(header)] = headers[header];
    }
  }

  params.Key = file.s3.path;
  params.Body = file.contents;

  return params;
}

module.exports._toAwsParams = toAwsParams;

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
    file.s3.path = file.path.substring(file.base.length).replace(/\\/g, '/');
  }
  return file;
}

function buildDeleteMultiple(keys) {
  if (!keys || !keys.length) return;

  var deleteObjects = keys.map(function (k) { return { Key: k }; });

  return {
    Delete: {
      Objects: deleteObjects
    }
  };
}

module.exports._buildDeleteMultiple = buildDeleteMultiple;

/**
 * create a through stream that gzip files
 * file content is gziped and Content-Encoding is added to s3.headers
 * @param  {Object} options
 *
 * options keys are:
 *   ext: extension to add to gzipped files
 *
 * @return {Stream}
 * @api public
 */

module.exports.gzip = function(options) {

  if (!options) options = {};
  if (!options.ext) options.ext = '';

  return through.obj(function (file, enc, cb) {

    // Do nothing if no contents
    if (file.isNull()) return cb();

    // streams not supported
    if (file.isStream()) {
      this.emit('error',
        new gutil.PluginError(PLUGIN_NAME, 'Stream content is not supported'));
      return cb();
    }

    // check if file.contents is a `Buffer`
    if (file.isBuffer()) {

      initFile(file);

      // add content-encoding header
      file.s3.headers['Content-Encoding'] = 'gzip';

      // zip file
      zlib.gzip(file.contents, function(err, buf) {
        if (err) return cb(err);
        file.unzipPath = file.path;
        file.path += options.ext;
        file.s3.path += options.ext;
        file.contents = buf;
        cb(err, file);
      });
    }
  });
};

/**
 * create a through stream that print s3 status info
 * @param {Object} param parameter to pass to logger
 *
 * @return {Stream}
 * @api public
 */

module.exports.reporter = function(param) {
  return require('./log-reporter')(param);
};

/**
 * create a new Publisher
 * @param {Object} S3 options as per http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property
 * @api private
 */

function Publisher(config) {
  this.config = config;
  this.client = new AWS.S3(config);

  // load cache
  try {
    this._cache = JSON.parse(fs.readFileSync(this.getCacheFilename(), 'utf8'));
  } catch (err) {
    this._cache = {};
  }
}

/**
 * generates cache filename.
 * @return {String}
 * @api private
 */

Publisher.prototype.getCacheFilename = function() {
  var bucket = this.config.params['Bucket'];

  if (!bucket) {
    throw new Error('Missing `params.Bucket` config value.');
  }

  return '.awspublish-' + bucket;
};

/**
 * create a through stream that save file in cache
 *
 * @return {Stream}
 * @api public
 */

Publisher.prototype.cache = function() {
  var _this = this,
      counter = 0;

  function saveCache() {
    fs.writeFileSync(_this.getCacheFilename(), JSON.stringify(_this._cache));
  }

  var stream = through.obj(function (file, enc, cb) {
    if (file.s3 && file.s3.path) {

      // do nothing for file already cached
      if (file.s3.state === 'cache') return cb(null, file);

      // remove deleted
      if (file.s3.state === 'delete') {
        delete _this._cache[file.s3.path];

      // update others
      } else if (file.s3.etag) {
        _this._cache[file.s3.path] = file.s3.etag;
      }

      // save cache every 10 files
      if (++counter % 10) saveCache();
    }

    cb(null, file);
  });

  stream.on('finish', saveCache);

  return stream;
};


/**
 * create a through stream that publish files to s3
 * @headers {Object} headers additional headers to add to s3
 * @options {Object} options option hash
 *
 * available options are:
 * - force {Boolean} force upload
 *
 * @return {Stream}
 * @api public
 */

Publisher.prototype.publish = function (headers, options) {

  var _this = this;

  // init opts
  if (!options) options = { force: false };

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
        new gutil.PluginError(PLUGIN_NAME, 'Stream content is not supported'));
      return cb();
    }

    // check if file.contents is a `Buffer`
    if (file.isBuffer()) {

      initFile(file);

      // calculate etag
      etag = '"' + md5Hash(file.contents) + '"';

      // delete - stop here
      if (file.s3.state === 'delete') return cb(null, file);

      // check if file is identical as the one in cache
      if (!options.force && _this._cache[file.s3.path] === etag) {
        file.s3.state = 'cache';
        return cb(null, file);
      }

      // add content-type header
      if (!file.s3.headers['Content-Type']) file.s3.headers['Content-Type'] = getContentType(file);

      // add content-length header
      if (!file.s3.headers['Content-Length']) file.s3.headers['Content-Length'] = file.contents.length;

      // add extra headers
      for (header in headers) file.s3.headers[header] = headers[header];

      if (options.simulate) return cb(null, file);

      // get s3 headers
      _this.client.headObject({ Key: file.s3.path }, function(err, res) {
        //ignore 403 and 404 errors since we're checking if a file exists on s3
        if (err && [403, 404].indexOf(err.statusCode) < 0) return cb(err);

        res = res || {};

        // skip: no updates allowed
        var noUpdate = options.createOnly && res.ETag;

        // skip: file are identical
        var noChange = !options.force && res.ETag === etag;

        if (noUpdate || noChange) {
          file.s3.state = 'skip';
          file.s3.etag = etag;
          file.s3.date = new Date(res.LastModified);
          cb(err, file);

        // update: file are different
        } else {
          file.s3.state = res.ETag
            ? 'update'
            : 'create';

          _this.client.putObject(toAwsParams(file), function(err) {
            if (err) return cb(err);

            file.s3.date = new Date();
            file.s3.etag = etag;
            cb(err, file);
          });
        }
      });
    }
  });
};

/**
 * Sync file in stream with file in the s3 bucket
 * @param {String} prefix
 *
 * @return {Stream} a transform stream that stream both new files and delete files
 * @api public
 */

Publisher.prototype.sync = function(prefix) {
  var client = this.client,
      stream = new Stream.Transform({ objectMode : true }),
      newFiles = {};

  if (!prefix) prefix = '';

  // push file to stream and add files to s3 path to list of new files
  stream._transform = function(file, encoding, cb) {
    newFiles[file.s3.path] = true;
    this.push(file);
    cb();
  };

  stream._flush = function(cb) {
    var toDelete = [],
        lister;

    lister = client.listObjects({ Prefix: prefix })
      .createReadStream()
      .pipe(converter('Key'));

    lister.on('data', function (key) {
      var deleteFile;
      if (newFiles[key]) return;

      deleteFile = new File({});
      deleteFile.s3 = {
        path: key,
        state: 'delete',
        headers: {}
      };

      stream.push(deleteFile);
      toDelete.push(key);
    });

    lister.on('end', function() {
      if (!toDelete.length) return cb();
      client.deleteObjects(buildDeleteMultiple(toDelete), cb);
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
