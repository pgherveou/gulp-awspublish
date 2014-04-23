var fs = require('fs');
var gulp = require('gulp');
var gutil = require('gulp-util');
var rename = require('gulp-rename');
var awspublish = require('../');

var credentials = JSON.parse(fs.readFileSync('aws-credentials.json', 'utf8'));
var publisher = awspublish.create(credentials);


// gulp.src('examples/fixtures/*.js')
//   .pipe(rename(function (path) {
//     path.dirname += '/s3-examples';
//     path.basename += '-s3';
//   }))
//   .pipe(publisher.publish())
//   .pipe(awspublish.reporter());



// gulp.src('**/*.js', {cwd: 'examples'})
//   .pipe(publisher.publish())
//   .pipe(awspublish.reporter());

gulp.src('public/assets/**', {cwd: 'examples'})
  .pipe(rename(function (path) {
    path.dirname = 'public/assets/' + path.dirname;
  }))
  .pipe(publisher.publish())
  .pipe(awspublish.reporter());