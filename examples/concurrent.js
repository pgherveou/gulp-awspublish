var fs = require('fs');
var gulp = require('gulp');
var parallelize = require("concurrent-transform");
var awspublish = require('../');

var credentials = JSON.parse(fs.readFileSync('aws-credentials.json', 'utf8'));
var publisher = awspublish.create(credentials);

gulp
  .src('examples/fixtures/*.js')
  .pipe(parallelize(publisher.publish(), 50))
  .pipe(awspublish.reporter());
