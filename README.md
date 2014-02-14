# gulp-awspublish
[![NPM version][npm-image]][npm-url] [![Dependency Status][depstat-image]][depstat-url]

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
    publisher = awspublish.create({ key: '...', secret: '...', bucket: '...'}),
    headers = { 'Cache-Control': 'max-age=315360000, no-transform, public' };

// publish all js files
// Set Content-Length, Content-Type and Cache-Control headers
// Set x-amz-acl to public-read by default
var js = gulp.src('./public/*.js')
  .pipe(publisher.publish(headers));

// gzip and publish all js files
// Content-Encoding headers will be added on top of other headers
// uploaded files will have a jsgz extension
var jsgz = gulp.src('./public/*.js')
  .pipe(awspublish.gzip())
  .pipe(publisher.publish(headers));

// sync content of s3 bucket with files in the stream
// cache s3 etags locally to avoid unnecessary request next time
// print progress with reporter
es.merge(js, jsgz)
  .pipe(publisher.sync())
  .pipe(publisher.cache())
  .pipe(awspublish.reporter());

```

## Testing

add an aws-credentials.json json file to the project directory
with your bucket credentials, then run mocha.

```json
 {
  "key": "...",
  "secret": "...",
  "bucket": "..."
}
```

## API

### awspublish.gzip()

 create a through stream, that gzip file and add Content-Encoding header

### awspublish.create(options)

Create a Publisher
Options are passed to knox to create a s3 client

#### Publisher.publish(headers)

create a through stream, that push files to s3.
publish take a `header` object that add or override existing s3 headers.

Files that go through the stream get extra properties
  s3.path: s3 path
  s3.etag: file etag
  s3.state: publication state (create, update, cache or skip)
  s3.headers: s3 headers for this file

Defaults headers are:
  - x-amz-acl: public-read
  - Content-Type
  - Content-Length

#### publisher.cache()

 create a through stream that create or update a cache file using file s3 path
 and file etag. Consecutive runs of publish will use this file to avoid reuploading identical files


Cache file is save in the current working dir and is named.awspublish-bucket
The cache file is flushed to disk every 10 files just to be safe :)

#### Publisher.sync()

create a transform stream that delete old files from the bucket
Both new and delete files are written to the stream
deleted file will have s3.state set to delete

#### Publisher.client

the knox client to let you do other s3 operations

### awspublish.reporter([options])

create a reporter that logs s3.path and s3.state (delete, create, update, cache, skip)

Available options:
  - states: list of state to log (default to all)


## License

[MIT License](http://en.wikipedia.org/wiki/MIT_License)

[npm-url]: https://npmjs.org/package/gulp-awspublish
[npm-image]: https://badge.fury.io/js/gulp-awspublish.png

[depstat-url]: https://david-dm.org/pgherveou/gulp-awspublish
[depstat-image]: https://david-dm.org/pgherveou/gulp-awspublish.png
