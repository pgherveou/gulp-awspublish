var fs = require('fs');
var gulp = require('gulp');
var awspublish = require('../');
var merge = require('merge-stream');

var credentials = JSON.parse(fs.readFileSync('aws-credentials.json', 'utf8'));
var publisher = awspublish.create(credentials);

// you can use a filter to source only files you want gzipped
var gzipFilter = [ 'public/**/*.js', 'public/**/*.html', 'public/**/*.css' ];

// it's a good idea to create an inverse filter to avoid uploading duplicates
// see https://github.com/wearefractal/vinyl-fs#srcglobs-opt for more details
var plainFilter = [ 
  'public/**/*', '!public/**/*.js', '!public/**/*.html', '!public/**/*.css'
];

var gzip = gulp.src(gzipFilter).pipe(awspublish.gzip());

var plain = gulp.src(plainFilter);

// use the merge-stream plugin to merge the gzip and plain files and upload
// them together
merge(gzip, plain)
  .pipe(publisher.cache())
  .pipe(publisher.publish())
  // now when you sync files of the other type will not be deleted
  .pipe(publisher.sync())
  .pipe(awspublish.reporter());
