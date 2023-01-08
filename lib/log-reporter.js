var colors = require('ansi-colors'),
  fancyLog = require('fancy-log'),
  { Transform } = require('stream');

/**
 * create a log reporter
 * @param {Object} options reporter options
 *
 * available options are:
 *   - states: list of state to log (default to all)
 */

module.exports = function ({ states = [] } = {}) {
  const allowedStates = new Set(states);
  const stream = new Transform({ objectMode: true });
  stream._transform = function (file, enc, cb) {
    var state;
    if (!file.s3) return cb(null, file);
    if (!file.s3.state) return cb(null, file);
    if (!allowedStates.has(file.s3.state)) return cb(null, file);

    state = '[' + file.s3.state + ']';
    state = state.padEnd(8);

    switch (file.s3.state) {
      case 'create':
        state = colors.green(state);
        break;
      case 'delete':
        state = colors.red(state);
        break;
      default:
        state = colors.cyan(state);
        break;
    }

    fancyLog(state, file.s3.path);
    cb(null, file);
  };

  // force flowing mode
  // @see http://nodejs.org/docs/latest/api/stream.html#stream_event_end
  // @see https://github.com/pgherveou/gulp-awspublish/issues/13
  stream.resume();
  return stream;
};
