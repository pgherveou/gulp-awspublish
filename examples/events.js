var fs = require('fs');
var gulp = require('gulp');
var awspublish = require('../');

var credentials = JSON.parse(fs.readFileSync('aws-credentials.json', 'utf8'));
var publisher = awspublish.create(credentials);

gulp
  .src('examples/fixtures/*.js')
  .pipe(publisher.publish())
  .pipe(awspublish.reporter())

  .on('end', function() {
    console.log('end...');
  })

  .on('finish', function() {
    console.log('finish...');
  });





