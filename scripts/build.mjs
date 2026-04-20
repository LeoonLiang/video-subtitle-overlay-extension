import {
  copyDirectoryContents,
  ensureDir,
  getProjectPaths,
  getRootDir,
  removePath
} from "./build-lib.mjs";
import { fileURLToPath } from "node:url";

const rootDir = getRootDir(import.meta.url);
const paths = getProjectPaths(rootDir);

export function clean() {
  removePath(paths.distDir);
}

export function build() {
  clean();
  ensureDir(paths.outDir);
  copyDirectoryContents(paths.srcDir, paths.outDir);

  console.log(`Built extension to ${paths.outDir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--clean")) {
    clean();
    console.log("Cleaned dist directory");
  } else {
    build();
  }
}
