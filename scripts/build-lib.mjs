import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  writeFileSync,
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

export function getReleaseNotesName() {
  return "release-notes.md";
}

export function normalizeExtensionVersion(input) {
  const rawValue = String(input || "").trim();
  const normalized = rawValue.startsWith("v") ? rawValue.slice(1) : rawValue;

  if (!/^\d+\.\d+\.\d+$/.test(normalized)) {
    throw new Error(`Invalid extension version: ${input}`);
  }

  return normalized;
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
    ),
    releaseNotesPath: resolve(rootDir, "dist", "release", getReleaseNotesName())
  };
}

function normalizeVersionHeading(input) {
  return normalizeExtensionVersion(input);
}

export function pickChangelogSection(changelogContent, tagName) {
  const targetVersion = normalizeVersionHeading(tagName);
  const lines = String(changelogContent || "").replace(/\r/g, "").split("\n");
  let collecting = false;
  const sectionLines = [];

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);

    if (headingMatch) {
      if (collecting) {
        break;
      }

      const headingText = headingMatch[1].trim();

      try {
        collecting = normalizeVersionHeading(headingText) === targetVersion;
      } catch (error) {
        collecting = false;
      }

      continue;
    }

    if (collecting) {
      sectionLines.push(line);
    }
  }

  const section = sectionLines.join("\n").trim();

  if (!section) {
    throw new Error(`Missing CHANGELOG section for ${tagName}`);
  }

  return section;
}

export function buildReleaseNotes({ tagName, changelogContent }) {
  const changes = pickChangelogSection(changelogContent, tagName);

  return [
    "## 本次更新",
    "",
    changes,
    "",
    "## 安装方式",
    "",
    `1. 下载 \`${getReleaseArchiveName()}\``,
    "2. 解压 zip 文件",
    "3. 在 Chrome 或 Edge 扩展管理页选择“加载已解压的扩展程序”",
    "4. 选择解压后的目录",
    ""
  ].join("\n");
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

export function updateManifestVersion(manifestPath, version) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.version = normalizeExtensionVersion(version);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
