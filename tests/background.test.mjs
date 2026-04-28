import assert from "assert";

import "../src/background.js";

const { downloadSubtitleFromUrl } = globalThis.__VSO_BACKGROUND__ || {};

assert.ok(downloadSubtitleFromUrl, "downloadSubtitleFromUrl should be defined");

{
  const result = await downloadSubtitleFromUrl("   ", async () => {
    throw new Error("fetch should not be called");
  });

  assert.deepStrictEqual(
    result,
    {
      ok: false,
      error: "请输入字幕链接"
    },
    "should reject empty subtitle URLs before fetching"
  );
}

{
  const result = await downloadSubtitleFromUrl(
    "https://example.com/a.srt",
    async (url) => ({
      ok: true,
      text: async () => `payload from ${url}`
    })
  );

  assert.deepStrictEqual(
    result,
    {
      ok: true,
      content: "payload from https://example.com/a.srt"
    },
    "should return subtitle content on successful fetch"
  );
}

{
  const result = await downloadSubtitleFromUrl(
    "https://example.com/missing.srt",
    async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found"
    })
  );

  assert.deepStrictEqual(
    result,
    {
      ok: false,
      error: "下载字幕失败（404 Not Found）"
    },
    "should report HTTP status failures"
  );
}

{
  const result = await downloadSubtitleFromUrl(
    "https://example.com/offline.srt",
    async () => {
      throw new Error("network down");
    }
  );

  assert.deepStrictEqual(
    result,
    {
      ok: false,
      error: "下载字幕失败：network down"
    },
    "should report thrown fetch errors"
  );
}

console.log("background tests passed");
