var Readable = require('readable-stream').Readable;

/**
 * Returns a stream for any paged AWS function
 * you can optionally provide a mapping function
 * like S3::listObjectsV2()
 *
 * @param {function} req - a non executed AWS function
 * @param {function} fn - a function that selects/maps the results
 * @param {object} opts - stream options
 */
module.exports = function(req, fn, opts) {
  opts = Object.assign({}, opts, { read: read, objectMode: true });
  if (!fn)
    fn = function(_in) {
      return _in;
    };

  var stream = new Readable(opts);
  stream.on('error', function(e) {
    console.log(e);
  });

  return stream;

  function read() {
    if (!req) return;

    var _req = req;
    req = null; //poor man's once!
    _req.send(page_handler);
  }

  function page_handler(e, data) {
    if (e) return stream.destroy(e);
    data.Contents.forEach(function(obj) {
      stream.push(fn(obj));
    });

    req = this.hasNextPage() ? this.nextPage() : null;
    if (!req) stream.push(null);
  }
};
