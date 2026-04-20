import assert from "assert";
import {
  getProjectPaths,
  getReleaseArchiveName,
  normalizeExtensionVersion
} from "../scripts/build-lib.mjs";

const rootDir = "/tmp/example-extension";
const paths = getProjectPaths(rootDir);

assert.strictEqual(
  getReleaseArchiveName(),
  "video-subtitle-overlay-extension.zip"
);
assert.strictEqual(paths.srcDir, "/tmp/example-extension/src");
assert.strictEqual(paths.outDir, "/tmp/example-extension/dist/chrome");
assert.strictEqual(
  paths.releaseArchivePath,
  "/tmp/example-extension/dist/release/video-subtitle-overlay-extension.zip"
);
assert.strictEqual(normalizeExtensionVersion("v1.0.1"), "1.0.1");
assert.strictEqual(normalizeExtensionVersion("1.2.3"), "1.2.3");
assert.throws(
  () => normalizeExtensionVersion("feature-branch"),
  /Invalid extension version/,
  "non-semver tag names should be rejected"
);

console.log("release-utils tests passed");
