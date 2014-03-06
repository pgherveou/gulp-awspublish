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
var awspublish = require('gulp-awspublish');
var publisher = awspublish.create({ 
  key: '...', 
  secret: '...', 
  bucket: '...'
 });

var headers = { 
   'Cache-Control': 'max-age=315360000, no-transform, public' 
   // ...
 };

// gzip and publish all js files (uploaded files will have a .gz extension)
// Set Content-Length, Content-Type and Cache-Control headers
// Set x-amz-acl to public-read by default
// Set Content-Encoding headers
var jsgz = gulp.src('./public/*.js')
  .pipe(awspublish.gzip({ ext: '.gz' }))
  .pipe(publisher.publish(headers));
  .pipe(publisher.cache()) // create a cache file to speed up next uploads
  .pipe(awspublish.reporter()); // print upload updates to console
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

### awspublish.gzip(options)

create a through stream, that gzip file and add Content-Encoding header.

Available options:
  - ext: file extension to add to gzipped file (eg: { ext: '.gz' })

### awspublish.create(options)

Create a Publisher. Options are passed to knox to create a s3 client.

#### Publisher.publish(headers)

Create a through stream, that push files to s3.Publish take a `header` object that add or override existing s3 headers.

Files that go through the stream receive extra properties:

  - s3.path: s3 path
  - s3.etag: file etag
  - s3.state: publication state (create, update, cache or skip)
  - s3.headers: s3 headers for this file. Defaults headers are:
    - x-amz-acl: public-read
    - Content-Type
    - Content-Length

#### publisher.cache()

Create a through stream that create or update a cache file using file s3 path and file etag.
Consecutive runs of publish will use this file to avoid reuploading identical files.

Cache file is save in the current working dir and is named.awspublish-bucket. The cache file is flushed to disk every 10 files just to be safe :).

#### Publisher.sync()

create a transform stream that delete old files from the bucket. Both new and delete files are written to the stream. Deleted file will have s3.state property set to delete.

> **warning** `sync` will delete files in your bucket that are not in your local folder.

```js
// this will publish and sync bucket files with the one in your public directory  
gulp.src('./public/*')
  .pipe(publisher.publish())
  .pipe(publisher.sync())  
  .pipe(awspublish.reporter()); 
  
```


#### Publisher.client

The knox client object exposed to let you do other s3 operations.

### awspublish.reporter([options])

Create a reporter that logs s3.path and s3.state (delete, create, update, cache, skip).

Available options:
  - states: list of state to log (default to all)

## License

[MIT License](http://en.wikipedia.org/wiki/MIT_License)

[npm-url]: https://npmjs.org/package/gulp-awspublish
[npm-image]: https://badge.fury.io/js/gulp-awspublish.png

[depstat-url]: https://david-dm.org/pgherveou/gulp-awspublish
[depstat-image]: https://david-dm.org/pgherveou/gulp-awspublish.png
