import assert from "assert";
import { getProjectPaths, getReleaseArchiveName } from "../scripts/build-lib.mjs";

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

console.log("release-utils tests passed");
