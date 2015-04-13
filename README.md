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

gulp.task('publish', function() {

  // create a new publisher using S3 options
  // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property
  var publisher = awspublish.create({
    params: {
      Bucket: '...'
    }
  });

  // define custom headers
  var headers = {
    'Cache-Control': 'max-age=315360000, no-transform, public'
    // ...
  };

  return gulp.src('./public/*.js')
     // gzip, Set Content-Encoding headers and add .gz extension
    .pipe(awspublish.gzip({ ext: '.gz' }))

    // publisher will add Content-Length, Content-Type and headers specified above
    // If not specified it will set x-amz-acl to public-read by default
    .pipe(publisher.publish(headers))

    // create a cache file to speed up consecutive uploads
    .pipe(publisher.cache())

     // print upload updates to console
    .pipe(awspublish.reporter());
});

// output
// [gulp] [create] file1.js.gz
// [gulp] [create] file2.js.gz
// [gulp] [update] file3.js.gz
// [gulp] [cache]  file3.js.gz
// ...
```

* Note: If you follow the [aws-sdk suggestions](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html) for
  providing your credentials you don't need to pass them in to create the publisher.

## Testing

add an aws-credentials.json json file to the project directory
with your bucket credentials, then run mocha.

```json
{
  "params": {
    "Bucket": "..."
  },
  "accessKeyId": "...",
  "secretAccessKey": "..."
}
```

## API

### awspublish.gzip(options)

create a through stream, that gzip file and add Content-Encoding header.

Available options:
  - ext: file extension to add to gzipped file (eg: { ext: '.gz' })

### awspublish.create(options)

Create a Publisher.
Options are used to create an `aws-sdk` S3 client. At a minimum you must pass
a `bucket` option, to define the site bucket. If you are using the [aws-sdk suggestions](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html) for credentials you do not need
to provide anything else.

Also supports credentials specified in the old [knox](https://github.com/LearnBoost/knox#client-creation-options)
format, a `profile` property for choosing a specific set of shared AWS creds, or and `accessKeyId` and `secretAccessKey` provided explicitly.

#### Publisher.publish([headers], [options])

Create a through stream, that push files to s3.
- header: hash of headers to add or override to existing s3 headers.
- options: optional additional publishing options
  - force: bypass cache / skip
  - simulate: debugging option to simulate s3 upload
  - createOnly: skip file updates

Files that go through the stream receive extra properties:

  - s3.path: s3 path
  - s3.etag: file etag
  - s3.date: file last modified date
  - s3.state: publication state (create, update, delete, cache or skip)
  - s3.headers: s3 headers for this file. Defaults headers are:
    - x-amz-acl: public-read
    - Content-Type
    - Content-Length

#### publisher.cache()

Create a through stream that create or update a cache file using file s3 path and file etag.
Consecutive runs of publish will use this file to avoid reuploading identical files.

Cache file is save in the current working dir and is named `.awspublish-<bucket>`. The cache file is flushed to disk every 10 files just to be safe.

#### Publisher.sync([prefix])

create a transform stream that delete old files from the bucket.
You can speficy a prefix to sync a specific directory.

> **warning** `sync` will delete files in your bucket that are not in your local folder.

```js
// this will publish and sync bucket files with the one in your public directory
gulp.src('./public/*')
  .pipe(publisher.publish())
  .pipe(publisher.sync())
  .pipe(awspublish.reporter());

// output
// [gulp] [create] file1.js
// [gulp] [update] file2.js
// [gulp] [delete] file3.js
// ...

```

#### Publisher.client

The `aws-sdk` S3 client is exposed to let you do other s3 operations.

### awspublish.reporter([options])

Create a reporter that logs s3.path and s3.state (delete, create, update, cache, skip).

Available options:
  - states: list of state to log (default to all)

```js
// this will publish,sync bucket files and print created, updated and deleted files
gulp.src('./public/*')
  .pipe(publisher.publish())
  .pipe(publisher.sync())
  .pipe(awspublish.reporter({
      states: ['create', 'update', 'delete']
    }));
```

## Examples

### rename file & directory

You can use `gulp-rename` to rename your files on s3

```js
// see examples/rename.js

gulp.src('examples/fixtures/*.js')
    .pipe(rename(function (path) {
        path.dirname += '/s3-examples';
        path.basename += '-s3';
    }))
    .pipe(publisher.publish())
    .pipe(awspublish.reporter());

// output
// [gulp] [create] s3-examples/bar-s3.js
// [gulp] [create] s3-examples/foo-s3.js
```

### upload file in parallel

You can use `concurrent-transform` to upload files in parallel to your amazon bucket

```js
var parallelize = require("concurrent-transform");

gulp
  .src('examples/fixtures/*.js')
  .pipe(parallelize(publisher.publish(), 10))
  .pipe(awspublish.reporter());
```

## Plugins

### gulp-awspublish-router
A router for defining file-specific rules
https://www.npmjs.org/package/gulp-awspublish-router

## License

[MIT License](http://en.wikipedia.org/wiki/MIT_License)

[npm-url]: https://npmjs.org/package/gulp-awspublish
[npm-image]: https://badge.fury.io/js/gulp-awspublish.png

[depstat-url]: https://david-dm.org/pgherveou/gulp-awspublish
[depstat-image]: https://david-dm.org/pgherveou/gulp-awspublish.png
