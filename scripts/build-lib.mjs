import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmdirSync,
  unlinkSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function getRootDir(importMetaUrl) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), "..");
}

export function getReleaseArchiveName() {
  return "video-subtitle-overlay-extension.zip";
}

export function getProjectPaths(rootDir) {
  return {
    srcDir: resolve(rootDir, "src"),
    distDir: resolve(rootDir, "dist"),
    outDir: resolve(rootDir, "dist", "chrome"),
    releaseDir: resolve(rootDir, "dist", "release"),
    releaseArchivePath: resolve(
      rootDir,
      "dist",
      "release",
      getReleaseArchiveName()
    )
  };
}

export function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export function removePath(targetPath) {
  if (!existsSync(targetPath)) {
    return;
  }

  const targetStats = lstatSync(targetPath);

  if (targetStats.isDirectory()) {
    for (const entry of readdirSync(targetPath)) {
      removePath(resolve(targetPath, entry));
    }

    rmdirSync(targetPath);
    return;
  }

  unlinkSync(targetPath);
}

function copyRecursive(sourcePath, destinationPath) {
  const sourceStats = lstatSync(sourcePath);

  if (sourceStats.isDirectory()) {
    ensureDir(destinationPath);

    for (const entry of readdirSync(sourcePath)) {
      copyRecursive(
        resolve(sourcePath, entry),
        resolve(destinationPath, entry)
      );
    }

    return;
  }

  copyFileSync(sourcePath, destinationPath);
}

export function copyDirectoryContents(sourceDir, destinationDir) {
  ensureDir(destinationDir);

  for (const entry of readdirSync(sourceDir)) {
    copyRecursive(resolve(sourceDir, entry), resolve(destinationDir, entry));
  }
}

export function createZipArchive(sourceDir, archivePath) {
  const result = spawnSync("zip", ["-rq", archivePath, "."], {
    cwd: sourceDir,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error("zip command failed");
  }
}
