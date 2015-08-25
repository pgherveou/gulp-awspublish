var fs = require('fs');
var gulp = require('gulp');
var awspublish = require('../');

var credentials = JSON.parse(fs.readFileSync('aws-credentials.json', 'utf8'));
var publisher = awspublish.create(credentials);

gulp
  .src('./examples/**/*.js')
  .pipe(publisher.publish())
  .pipe(publisher.sync())
  .pipe(awspublish.reporter())

// log [create] concurrent.js
// log [create] events.js
// log [create] merge-streams.js
// log [create] rename.js
// log [create] simple.js
// log [create] fixtures/bar.js
// log [create] fixtures/foo.js
// log [create] public/assets/js/foo.js

// gulp
//   .src('examples/fixtures/*.js')
//   .pipe(publisher.publish())
//   .pipe(publisher.sync())
//   .pipe(awspublish.reporter())

// log [skip]   bar.js
// log [skip]   foo.js
