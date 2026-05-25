import assert from "assert";
import {
  buildReleaseNotes,
  getProjectPaths,
  getReleaseArchiveName,
  normalizeExtensionVersion,
  pickChangelogSection
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

const changelog = `# Changelog

## v1.2.0

- 新增字幕菜单
- 当前字幕高亮

## v1.1.0

- 旧版本内容
`;

assert.strictEqual(
  pickChangelogSection(changelog, "v1.2.0"),
  "- 新增字幕菜单\n- 当前字幕高亮",
  "should extract the matching version section from CHANGELOG.md"
);

assert.strictEqual(
  pickChangelogSection(changelog, "1.2.0"),
  "- 新增字幕菜单\n- 当前字幕高亮",
  "should match changelog sections with or without a leading v"
);

assert.throws(
  () => pickChangelogSection(changelog, "v9.9.9"),
  /Missing CHANGELOG section/,
  "missing changelog sections should fail the release"
);

assert.strictEqual(
  buildReleaseNotes({
    tagName: "v1.2.0",
    changelogContent: changelog
  }),
  `## 本次更新\n\n- 新增字幕菜单\n- 当前字幕高亮\n\n## 安装方式\n\n1. 下载 \`video-subtitle-overlay-extension.zip\`\n2. 解压 zip 文件\n3. 在 Chrome 或 Edge 扩展管理页选择“加载已解压的扩展程序”\n4. 选择解压后的目录\n`,
  "should combine changelog notes with install instructions"
);

console.log("release-utils tests passed");
