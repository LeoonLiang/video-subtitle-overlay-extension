import { existsSync } from "node:fs";
import { build } from "./build.mjs";
import {
  createZipArchive,
  ensureDir,
  getProjectPaths,
  getRootDir,
  removePath
} from "./build-lib.mjs";

const rootDir = getRootDir(import.meta.url);
const paths = getProjectPaths(rootDir);

build();

if (!existsSync(paths.outDir)) {
  throw new Error("Build output directory is missing");
}

ensureDir(paths.releaseDir);
removePath(paths.releaseArchivePath);
createZipArchive(paths.outDir, paths.releaseArchivePath);

console.log(`Packaged release asset at ${paths.releaseArchivePath}`);
