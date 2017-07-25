# gulp-awspublish
[![NPM version][npm-image]][npm-url] [![Dependency Status][depstat-image]][depstat-url] [![Mentions][mentions-image]][mentions-url] 

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
    region: 'your-region-id',
    params: {
      Bucket: '...'
    }
  }, {
    cacheFileName: 'your-cache-location'
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

* Note: In order for publish to work on S3, your policy has to allow the following S3 actions:

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::BUCKETNAME"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:PutObjectAcl",
                "s3:GetObject",
                "s3:GetObjectAcl",
                "s3:DeleteObject",
                "s3:ListMultipartUploadParts",
                "s3:AbortMultipartUpload"
            ],
            "Resource": [
                "arn:aws:s3:::BUCKETNAME/*"
            ]
        }
    ]
}
```

## Custom headers

You can add different headers to different files using glob filter syntax:

```
	var headers = {
		"Cache-Control": 'max-age=86400, no-transform, public',
		"fileFilters": [
			{
				"filter": '**/*.txt',
				"Cache-Control": 'max-age=604800, no-transform, public'
			},
			{
				"filter": ['**/*.jpg', '**/*.png'],
				"Cache-Control": 'max-age=315360000, no-transform, public'
			},
		]
	};

```

## Testing

1. Create an S3 bucket which will be used for the tests. Optionally create an IAM user for running the tests.
2. Set the buckets Permission, so it can be edited by the IAM user who will run the tests.
3. Add an aws-credentials.json file to the project directory with the name of your testing buckets
and the credentials of the user who will run the tests.
4. Run `npm test`

```json
{
  "params": {
    "Bucket": "<test-bucket-name>"
  },
  "accessKeyId": "<your-access-key-id>",
  "secretAccessKey": "<your-secret-access-key>",
  "signatureVersion": "v3"
}
```

## API

### awspublish.gzip(options)

create a through stream, that gzip file and add Content-Encoding header.

* Note: Node version 0.12.x or later is required in order to use `awspublish.gzip`. If you need an older node engine to work with gzipping, you can use [v2.0.2](https://github.com/pgherveou/gulp-awspublish/tree/v2.0.2).

Available options:
  - ext: file extension to add to gzipped file (eg: { ext: '.gz' })
  - Any options that can be passed to [zlib.gzip](https://nodejs.org/api/zlib.html#zlib_options)

### awspublish.create(AWSConfig, cacheOptions)

Create a Publisher.
The AWSConfig object is used to create an `aws-sdk` S3 client. At a minimum you must pass a `Bucket` key, to define the site bucket. You can find all available options in the [AWS SDK documentation](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property).

The cacheOptions object allows you to define the location of the cached hash digests. By default, they will be saved in your projects root folder in a hidden file called '.awspublish-' + 'name-of-your-bucket'.

#### Adjusting upload timeout
The AWS client has a default timeout which may be too low when pushing large files (> 50mb).
To adjust timeout, add `httpOptions: { timeout: 300000 }` to the AWSConfig object.

#### Credentials

By default, gulp-awspublish uses the credential chain specified in the AWS [docs](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html).

Here are some example credential configurations:

Hardcoded credentials (**Note**: We recommend you **not** hard-code credentials inside an application. Use this method only for small personal scripts or for testing purposes.):

```
var publisher = awspublish.create({
  region: 'your-region-id',
  params: {
    Bucket: '...'
  },
  accessKeyId: 'akid',
  secretAccessKey: 'secret'
});
```

Using a profile by name from `~/.aws/credentials`:

```
var AWS = require('aws-sdk');

var publisher = awspublish.create({
  region: 'your-region-id',
  params: {
    Bucket: '...'
  },
  credentials: new AWS.SharedIniFileCredentials({profile: 'myprofile'})
});
```

Instead of putting anything in the configuration object, you can also provide the following environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_PROFILE`. You can also define a `[default]` profile in `~/.aws/credentials` which the SDK will use transparently without needing to set anything.

#### Publisher.publish([headers], [options])

Create a through stream, that push files to s3.
- header: hash of headers to add or override to existing s3 headers.
- options: optional additional publishing options
  - force: bypass cache / skip
  - noAcl: do not set x-amz-acl by default
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

> Note: `publish` will never delete files remotely. To clean up unused remote files use `sync`.

#### publisher.cache()

Create a through stream that create or update a cache file using file s3 path and file etag.
Consecutive runs of publish will use this file to avoid reuploading identical files.

Cache file is save in the current working dir and is named `.awspublish-<bucket>`. The cache file is flushed to disk every 10 files just to be safe.

#### Publisher.sync([prefix], [whitelistedFiles])

create a transform stream that delete old files from the bucket.
  - prefix: prefix to sync a specific directory
  - whitelistedFiles: array that can contain regular expressions or strings that match against filenames that
               should never be deleted from the bucket.

e.g.
```js
// only directory bar will be synced
// files in folder /foo/bar and file baz.txt will not be removed from the bucket despite not being in your local folder
gulp.src('./public/*')
  .pipe(publisher.publish())
  .pipe(publisher.sync('bar', [/^foo\/bar/, 'baz.txt']))
  .pipe(awspublish.reporter());
```

> **warning** `sync` will delete files in your bucket that are not in your local folder unless they're whitelisted.

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

### [Rename file & directory](examples/rename.js)

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

### [Upload file in parallel](examples/concurrent.js)

You can use `concurrent-transform` to upload files in parallel to your amazon bucket

```js
var parallelize = require("concurrent-transform");

gulp
  .src('examples/fixtures/*.js')
  .pipe(parallelize(publisher.publish(), 10))
  .pipe(awspublish.reporter());
```

### Upload both gzipped and plain files in one stream

You can use the [`merge-stream`](https://github.com/grncdr/merge-stream) plugin
to upload two streams in parallel, allowing `sync` to work with mixed file
types

```js
var merge = require('merge-stream');
var gzip = gulp.src('public/**/*.js').pipe(awspublish.gzip());
var plain = gulp.src([ 'public/**/*', '!public/**/*.js' ]);

merge(gzip, plain)
  .pipe(publisher.publish())
  .pipe(publisher.sync())
  .pipe(awspublish.reporter());
```

## Plugins

### gulp-awspublish-router
A router for defining file-specific rules
https://www.npmjs.org/package/gulp-awspublish-router

### gulp-cloudfront-invalidate-aws-publish
Invalidate cloudfront cache based on output from awspublish
https://www.npmjs.com/package/gulp-cloudfront-invalidate-aws-publish

## License

[MIT License](http://en.wikipedia.org/wiki/MIT_License)

[npm-url]: https://npmjs.org/package/gulp-awspublish
[npm-image]: https://badge.fury.io/js/gulp-awspublish.png

[depstat-url]: https://david-dm.org/pgherveou/gulp-awspublish
[depstat-image]: https://david-dm.org/pgherveou/gulp-awspublish.png

[mentions-url]: http://107.170.57.103/pgherveou/gulp-awspublish
[mentions-image]: http://107.170.57.103/pgherveou/gulp-awspublish.svg
