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
    publisher = awspublish({ key: '...', secret: '...', bucket: '...'}),
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
publisher
  .sync(es.merge(js, jsgz)))
  .pipe(publisher.cache())
  .pipe(publisher.reporter());

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

 create a through stream, that gzip files and add Content-Encoding headers

### awspublish.create(options)

Create a Publisher
Options are passed to knox to create a s3 client

#### Publisher.publish(headers)

create a through stream, that push files to s3.
Publish take a header hash that add or override existing s3 headers.

if there is an .awspublish cache file, we first compare disk file etag
with the one in the cache, if etags match we dont query amazon
and file.s3.state is set to 'cache'

we then make a header query and compare the remote etag with the local one
if etags match we don't upload the file and file.s3.state is set to 'skip'

if there is a remote file.s3.state is set to 'update'
otherwhise file.s3.state is set to 'create'

Files that go through the stream get extra properties
  s3.path: s3 path
  s3.etag: file etag
  s3.state: publication state (create, update, cache or skip)
  s3.headers: s3 headers for this file

Defaults headers are
  - x-amz-acl (default to public-read)
  - Content-Type
  - Content-Length

### publisher.cache()

 create a through stream that create or update a cache file with the list
 of key value pair (s3.path/s3.etag)

 Cache file is save in the current working dir and is named.awspublish-<bucket>
 The cache file is flushed to disk every 10 files

#### Publisher.sync(stream)

Take a stream of files and sync the content of the s3 bucket with these files.
It return a readable stream with both input files and deleted files
deleted file will have s3.state set to delete

#### Publisher.client

The knox client is exposed to let you do other s3 operations

### awspublish.reporter()

 create a reporter that logs s3.path and s3.state (delete, create, update, cache, skip)


## License

[MIT License](http://en.wikipedia.org/wiki/MIT_License)

[npm-url]: https://npmjs.org/package/gulp-awspublish
[npm-image]: https://badge.fury.io/js/gulp-awspublish.png


[depstat-url]: https://david-dm.org/pgherveou/gulp-awspublish
[depstat-image]: https://david-dm.org/pgherveou/gulp-awspublish.png
