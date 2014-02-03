var pad = require('pad-component'),
  gutil = require('gulp-util'),
  through = require('through2');

/**
 * create a log reporter
 */

module.exports = function() {
  return through.obj(function (file, enc, cb) {
    var state;
    if (file.s3 && file.s3.state) {
      state = '[' + file.s3.state.toUpperCase() + ']';
      state = pad.right(state, 6);
      gutil.log(gutil.colors.cyan(state), file.s3.path);
    }
    cb(null, file);
  });
};
