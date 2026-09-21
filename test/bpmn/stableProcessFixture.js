'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const liveFixtureSuffix = path.normalize(path.join('workflow', 'diagrams', 'toexportbpmnteste.process'));
const encodedPath = path.join(__dirname, 'fixtures', 'toexportbpmnteste.process.gz.b64');
const encoded = fs.readFileSync(encodedPath, 'ascii').replace(/\s+/g, '');
const stableFixture = zlib.gunzipSync(Buffer.from(encoded, 'base64'));
const referenceRoot = path.normalize(path.join(__dirname, 'fixtures', 'referencias'));
const referenceBundlePath = path.join(__dirname, 'fixtures', 'process-references.json.gz.b64');
const referenceBundle = JSON.parse(zlib.gunzipSync(Buffer.from(
  fs.readFileSync(referenceBundlePath, 'ascii').replace(/\s+/g, ''),
  'base64'
)).toString('utf8'));
const originalReadFileSync = fs.readFileSync.bind(fs);
const originalReaddirSync = fs.readdirSync.bind(fs);

fs.readdirSync = function stableReferenceDirectory(directory, options) {
  const requestedPath = path.normalize(
    typeof directory === 'string'
      ? directory
      : directory?.pathname ?? directory?.toString?.() ?? ''
  );
  if (requestedPath === referenceRoot && !options?.withFileTypes) {
    return Object.keys(referenceBundle);
  }
  return originalReaddirSync(directory, options);
};

fs.readFileSync = function stableFixtureReadFileSync(file, options) {
  const requestedPath = typeof file === 'string'
    ? path.normalize(file)
    : path.normalize(file?.pathname ?? file?.toString?.() ?? '');
  if (requestedPath.startsWith(`${referenceRoot}${path.sep}`)
      && path.basename(requestedPath) === 'toexportbpmnteste.process') {
    const folder = path.basename(path.dirname(requestedPath));
    const reference = referenceBundle[folder];
    if (reference !== undefined) {
      const encoding = typeof options === 'string' ? options : options?.encoding;
      return encoding ? reference : Buffer.from(reference, 'ascii');
    }
  }
  if (!requestedPath.endsWith(liveFixtureSuffix)) return originalReadFileSync(file, options);
  const encoding = typeof options === 'string' ? options : options?.encoding;
  return encoding ? stableFixture.toString(encoding) : Buffer.from(stableFixture);
};
