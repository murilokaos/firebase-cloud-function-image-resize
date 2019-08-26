/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for t`he specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const functions = require('firebase-functions');
const mkdirp = require('mkdirp-promise');
const admin = require('firebase-admin');
admin.initializeApp();
const spawn = require('child-process-promise').spawn;
const path = require('path');
const os = require('os');
const fs = require('fs');

// Max height and width of the ImageResized in pixels.
const IMAGE_MAX_HEIGHT = 500;
const IMAGE_MAX_WIDTH = 500;
// ImageResized prefix added to file names.
const IMAGE_PREFIX = 'resized-';

/**
 * When an image is uploaded in the Storage bucket We generate a ImageResized automatically using
 * ImageMagick.
 * After the ImageResized has been generated and uploaded to Cloud Storage,
 * we write the public URL to the Firebase Realtime Database.
 */
exports.generateImageResized = functions.storage.object().onFinalize(async (object) => {
  // File and directory paths.
  const filePath = object.name;
  const contentType = object.contentType; // This is the image MIME type
  const fileDir = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const ImageFilePath = path.normalize(path.join(fileDir, `${IMAGE_PREFIX}${fileName}`));
  const tempLocalFile = path.join(os.tmpdir(), filePath);
  const tempLocalDir = path.dirname(tempLocalFile);
  const tempLocalImageFile = path.join(os.tmpdir(), ImageFilePath);

  // Exit if this is triggered on a file that is not an image.
  if (!contentType.startsWith('image/')) {
    return console.log('This is not an image.');
  }

  // Exit if the image is already a ImageResized.
  if (fileName.startsWith(IMAGE_PREFIX)) {
    return console.log('Already a ImageResized.');
  }

  // Cloud Storage files.
  const bucket = admin.storage().bucket(object.bucket);
  const file = bucket.file(filePath);
  // const ImageFile = bucket.file(ImageFilePath);
  const metadata = {
    contentType: contentType,
    // To enable Client-side caching you can set the Cache-Control headers here. Uncomment below.
    'Cache-Control': 'public,max-age=604800',
  };
  
  // Create the temp directory where the storage file will be downloaded.
  await mkdirp(tempLocalDir)
  // Download file from bucket.
  await file.download({destination: tempLocalFile});
  console.log('The file has been downloaded to', tempLocalFile);
  // Generate a ImageResized using ImageMagick.
  await spawn('convert', [tempLocalFile, '-resize', `${IMAGE_MAX_WIDTH}x${IMAGE_MAX_HEIGHT}>`, tempLocalImageFile], {capture: ['stdout', 'stderr']});
  console.log('ImageResized created at', tempLocalImageFile);
  // Uploading the ImageResized.
  await bucket.upload(tempLocalImageFile, {destination: ImageFilePath, metadata: metadata});
  console.log('ImageResized uploaded to Storage at', ImageFilePath);
  // Once the image has been uploaded delete the local files to free up disk space.
  fs.unlinkSync(tempLocalFile);
  fs.unlinkSync(tempLocalImageFile);
  // // Get the Signed URLs for the ImageResized and original image.
  // const config = {
  //   action: 'read',
  //   expires: '03-01-2500',
  // };
  // const results = await Promise.all([
  //   ImageFile.getSignedUrl(config),
  //   file.getSignedUrl(config),
  // ]);
  // console.log('Got Signed URLs.');
  // const ImageResult = results[0];
  // const originalResult = results[1];
  // const ImageFileUrl = ImageResult[0];
  // const fileUrl = originalResult[0];
  // Delete original File to free up disk space.
  // Add the URLs to the Database
  // await admin.database().ref('images').push({ path: fileUrl, ImageResized: ImageFileUrl });
  // return console.log('ImageResized URLs saved to database.');
  await file.delete();
  return console.log('ImageResized and original image deleted!');
});