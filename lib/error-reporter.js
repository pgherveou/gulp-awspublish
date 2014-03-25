/**
 * create an error reporter
 * @param {Object} err The error to report on
 */

module.exports = function(err) {

  switch(err.Code[0]) {

    case 'PermanentRedirect':
      return 'Error: ' + err.Code + '. ' + err.Message + '.. ' + err.Endpoint;
      break;

    case 'NoSuckBucket':
      return 'Error: ' + err.Code + '. ' + err.Message + '... ' + err.BucketName;
      break;

    default:
      return 'Error: ' + err.Code + '. ' + err.Message;
      break;

  }

};
