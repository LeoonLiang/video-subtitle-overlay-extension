import assert from "assert";
import "../src/content-helpers.js";

const {
  getSubtitleFilenameFromUrl,
  formatDelayLabel
} = globalThis.__VSO_HELPERS__ || {};

assert.ok(getSubtitleFilenameFromUrl, "getSubtitleFilenameFromUrl should be defined");
assert.ok(formatDelayLabel, "formatDelayLabel should be defined");

assert.strictEqual(
  getSubtitleFilenameFromUrl("https://www.subtitlecat.com/subs/1456/START-547-zh-CN.srt"),
  "START-547-zh-CN.srt",
  "should derive a subtitle filename from a direct URL"
);

assert.strictEqual(
  getSubtitleFilenameFromUrl("https://example.com/subtitles/%E4%B8%AD%E6%96%87.srt?download=1"),
  "中文.srt",
  "should decode percent-encoded URL filenames"
);

assert.strictEqual(
  getSubtitleFilenameFromUrl("not-a-url"),
  "remote-subtitle.srt",
  "should fall back to a safe filename for invalid URLs"
);

assert.strictEqual(
  formatDelayLabel(0),
  "0.0s",
  "should format zero delay without a sign"
);

assert.strictEqual(
  formatDelayLabel(-500),
  "-0.5s",
  "should format negative delay as earlier subtitles"
);

assert.strictEqual(
  formatDelayLabel(1000),
  "+1.0s",
  "should format positive delay as later subtitles"
);

console.log("subtitle-source tests passed");
