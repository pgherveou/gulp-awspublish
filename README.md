
# gulp-awspublish
[![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url]  [![Coverage Status](coveralls-image)](coveralls-url) [![Dependency Status][depstat-image]][depstat-url]

> awspublish plugin for [gulp](https://github.com/wearefractal/gulp)

## Usage

First, install `gulp-awspublish` as a development dependency:

```shell
npm install --save-dev gulp-awspublish
```

Then, add it to your `gulpfile.js`:

```javascript
var es = require('event-stream'),
    awspublish = require('gulp-awspublish'),
    publisher = awspublish({ key: '...', secret: '...', bucket: '...'}),
    headers = { 'Cache-Control': 'max-age=315360000, no-transform, public' };

// publish all js files
// Cache-Control headers will be added on top of other headers
var js = gulp.src('./public/*.js')
  .pipe(publisher.publish(headers));

// gzip and publish all js files
// Content-Encoding headers will be added on top of other headers
var jsgz = gulp.src('./public/*.js')
  .pipe(awspublish.gzip())
  .pipe(publisher.publish(headers));

// sync content of s3 bucket with published files
// print progress with reportr
publisher
  .sync(es.merge(js, jsgz))
  .pipe(publisher.reporter());


```

## API

### awspublish.gzip()

 create a gzip through stream, that gzip files and add Content-Encoding headers

### awspublish.create(options)

Create a Publisher
Options are passed to knox to create a s3 client

#### Publisher.publish(headers)

create a through stream, that push files to s3.
Publish take a header hash as argument to override or add other s3 headers.


Files that get out of the stream get extra properties
  s3.path: s3 path of this file
  s3.state: publish state (add, update or skip)
  s3.headers: s3 headers for this file

Defaults headers are
  - x-amz-acl (default to public-read)
  - Content-Type
  - Content-Length

#### Publisher.sync(stream)

Take a stream of files and sync the content of the s3 bucket with these files.
It return a readable stream with both input files and deleted files
deleted file will have s3.state set to delete

### awspublish.reporter()

 create a reporter that logs to console each file state (delete, add, update, skip) and s3 path


## License

[MIT License](http://en.wikipedia.org/wiki/MIT_License)

[npm-url]: https://npmjs.org/package/gulp-awspublish
[npm-image]: https://badge.fury.io/js/gulp-awspublish.png

[travis-url]: http://travis-ci.org/pgherveou/gulp-awspublish
[travis-image]: https://secure.travis-ci.org/pgherveou/gulp-awspublish.png?branch=master

[coveralls-url]: https://coveralls.io/r/pgherveou/gulp-awspublish
[coveralls-image]: https://coveralls.io/repos/pgherveou/gulp-awspublish/badge.png

[depstat-url]: https://david-dm.org/pgherveou/gulp-awspublish
[depstat-image]: https://david-dm.org/pgherveou/gulp-awspublish.png
