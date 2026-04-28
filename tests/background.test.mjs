import assert from "assert";

import "../src/background.js";

const {
  downloadSubtitleFromUrl,
  parseSubtitleCatSearchResults,
  parseSubtitleCatLanguageOptions,
  searchSubtitleCat,
  fetchSubtitleCatLanguages
} = globalThis.__VSO_BACKGROUND__ || {};

assert.ok(downloadSubtitleFromUrl, "downloadSubtitleFromUrl should be defined");
assert.ok(parseSubtitleCatSearchResults, "parseSubtitleCatSearchResults should be defined");
assert.ok(parseSubtitleCatLanguageOptions, "parseSubtitleCatLanguageOptions should be defined");
assert.ok(searchSubtitleCat, "searchSubtitleCat should be defined");
assert.ok(fetchSubtitleCatLanguages, "fetchSubtitleCatLanguages should be defined");

const SEARCH_HTML = `
  <table class="table sub-table">
    <tbody>
      <tr>
        <td><a href="https://www.subtitlecat.com/subs/1462/SDMU-802%20jp.html">SDMU-802 jp</a> (translated from Japanese)</td>
        <td>&nbsp;</td>
        <td class="sub-table__size-cell"><span class="sub-table__metric-value">164 KB</span></td>
        <td>2 downloads</td>
        <td>2 languages</td>
      </tr>
      <tr>
        <td><a href="/subs/1447/SDMU-236_stitched.original.html">SDMU-236_stitched.original</a></td>
        <td>&nbsp;</td>
        <td class="sub-table__size-cell"><span class="sub-table__metric-value">123 KB</span></td>
        <td>1 downloads</td>
        <td>1 languages</td>
      </tr>
    </tbody>
  </table>
`;

const DETAIL_HTML = `
  <div class="sub-single">
    <span><img src="https://www.subtitlecat.com/assets/flags/cn.png" alt="zh-CN" class="flag"></span>
    <span>Chinese (Simplified)</span>
    <span><a id="download_zh-CN" href="https://www.subtitlecat.com/subs/1462/SDMU-802%20jp-zh-CN.srt" class="green-link">Download</a></span>
  </div>
  <div class="sub-single">
    <span><img src="https://www.subtitlecat.com/assets/flags/tw.png" alt="zh-TW" class="flag"></span>
    <span>Chinese (Traditional)</span>
    <span><a id="download_zh-TW" href="/subs/1462/SDMU-802%20jp-zh-TW.srt" class="green-link">Download</a></span>
  </div>
  <div class="sub-single">
    <span><img src="https://www.subtitlecat.com/assets/flags/gb.png" alt="en" class="flag"></span>
    <span>English</span>
    <span><button id="en" class="yellow-link">Translate</button></span>
  </div>
`;

assert.deepStrictEqual(
  parseSubtitleCatSearchResults(SEARCH_HTML),
  [
    {
      title: "SDMU-802 jp",
      detailUrl: "https://www.subtitlecat.com/subs/1462/SDMU-802%20jp.html",
      sizeLabel: "164 KB",
      downloadLabel: "2 downloads",
      languageCountLabel: "2 languages"
    },
    {
      title: "SDMU-236_stitched.original",
      detailUrl: "https://www.subtitlecat.com/subs/1447/SDMU-236_stitched.original.html",
      sizeLabel: "123 KB",
      downloadLabel: "1 downloads",
      languageCountLabel: "1 languages"
    }
  ],
  "should parse Subtitle Cat search results from server-rendered HTML"
);

assert.deepStrictEqual(
  parseSubtitleCatLanguageOptions(DETAIL_HTML),
  [
    {
      languageCode: "zh-CN",
      languageLabel: "Chinese (Simplified)",
      downloadUrl: "https://www.subtitlecat.com/subs/1462/SDMU-802%20jp-zh-CN.srt"
    },
    {
      languageCode: "zh-TW",
      languageLabel: "Chinese (Traditional)",
      downloadUrl: "https://www.subtitlecat.com/subs/1462/SDMU-802%20jp-zh-TW.srt"
    }
  ],
  "should parse only downloadable language options from a Subtitle Cat detail page"
);

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

{
  const result = await searchSubtitleCat(" SDMU 802 ", async (url) => ({
    ok: true,
    text: async () => {
      assert.strictEqual(
        url,
        "https://www.subtitlecat.com/index.php?search=SDMU%20802",
        "should fetch the Subtitle Cat search endpoint with an encoded query"
      );
      return SEARCH_HTML;
    }
  }));

  assert.deepStrictEqual(
    result,
    {
      ok: true,
      results: [
        {
          title: "SDMU-802 jp",
          detailUrl: "https://www.subtitlecat.com/subs/1462/SDMU-802%20jp.html",
          sizeLabel: "164 KB",
          downloadLabel: "2 downloads",
          languageCountLabel: "2 languages"
        },
        {
          title: "SDMU-236_stitched.original",
          detailUrl: "https://www.subtitlecat.com/subs/1447/SDMU-236_stitched.original.html",
          sizeLabel: "123 KB",
          downloadLabel: "1 downloads",
          languageCountLabel: "1 languages"
        }
      ]
    },
    "should return parsed Subtitle Cat search results"
  );
}

{
  const result = await searchSubtitleCat("   ", async () => {
    throw new Error("fetch should not be called");
  });

  assert.deepStrictEqual(
    result,
    {
      ok: false,
      error: "请输入搜索关键词"
    },
    "should reject empty Subtitle Cat search keywords"
  );
}

{
  const result = await fetchSubtitleCatLanguages(
    "https://www.subtitlecat.com/subs/1462/SDMU-802%20jp.html",
    async (url) => ({
      ok: true,
      text: async () => {
        assert.strictEqual(
          url,
          "https://www.subtitlecat.com/subs/1462/SDMU-802%20jp.html",
          "should fetch the selected Subtitle Cat detail page"
        );
        return DETAIL_HTML;
      }
    })
  );

  assert.deepStrictEqual(
    result,
    {
      ok: true,
      languages: [
        {
          languageCode: "zh-CN",
          languageLabel: "Chinese (Simplified)",
          downloadUrl: "https://www.subtitlecat.com/subs/1462/SDMU-802%20jp-zh-CN.srt"
        },
        {
          languageCode: "zh-TW",
          languageLabel: "Chinese (Traditional)",
          downloadUrl: "https://www.subtitlecat.com/subs/1462/SDMU-802%20jp-zh-TW.srt"
        }
      ]
    },
    "should return parsed Subtitle Cat language downloads"
  );
}

{
  const result = await fetchSubtitleCatLanguages("   ", async () => {
    throw new Error("fetch should not be called");
  });

  assert.deepStrictEqual(
    result,
    {
      ok: false,
      error: "请选择字幕条目"
    },
    "should reject empty detail URLs before fetching languages"
  );
}

console.log("background tests passed");
