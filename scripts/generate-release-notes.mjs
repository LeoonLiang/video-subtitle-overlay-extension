import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildReleaseNotes,
  ensureDir,
  getProjectPaths,
  getRootDir
} from "./build-lib.mjs";

const rootDir = getRootDir(import.meta.url);
const paths = getProjectPaths(rootDir);
const tagName = process.env.EXTENSION_VERSION || process.env.GITHUB_REF_NAME || "";

if (!tagName) {
  throw new Error("EXTENSION_VERSION or GITHUB_REF_NAME is required");
}

const changelogContent = readFileSync(resolve(rootDir, "CHANGELOG.md"), "utf8");
const releaseNotes = buildReleaseNotes({
  tagName,
  changelogContent
});

ensureDir(paths.releaseDir);
writeFileSync(paths.releaseNotesPath, releaseNotes);

console.log(`Generated release notes at ${paths.releaseNotesPath}`);
