(function attachVideoSubtitleOverlayBackground(globalObject) {
  const SUBTITLE_CAT_BASE_URL = "https://www.subtitlecat.com";

  function decodeHtmlEntities(text) {
    return String(text || "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }

  function stripHtml(text) {
    return decodeHtmlEntities(String(text || "").replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
  }

  function toAbsoluteSubtitleCatUrl(url) {
    try {
      return new URL(String(url || "").trim(), SUBTITLE_CAT_BASE_URL).toString();
    } catch (error) {
      return "";
    }
  }

  function getResponseError(prefix, response) {
    const suffix = response.statusText
      ? `${response.status} ${response.statusText}`
      : String(response.status);
    return `${prefix}（${suffix}）`;
  }

  function parseSubtitleCatSearchResults(html) {
    const rows = String(html || "").match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    const results = [];

    for (const row of rows) {
      const cells = row.match(/<td\b[\s\S]*?<\/td>/gi) || [];
      if (cells.length < 4) {
        continue;
      }

      const linkMatch = cells[0].match(/<a\b[^>]*href="([^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) {
        continue;
      }

      const detailUrl = toAbsoluteSubtitleCatUrl(linkMatch[1]);
      const title = stripHtml(linkMatch[2]);
      const sizeLabel = stripHtml(cells[2]);
      const downloadLabel = stripHtml(cells[3]);
      const languageCountLabel = stripHtml(cells[4] || "");

      if (!detailUrl || !title || !sizeLabel || !downloadLabel || !languageCountLabel) {
        continue;
      }

      results.push({
        title,
        detailUrl,
        sizeLabel,
        downloadLabel,
        languageCountLabel
      });
    }

    return results;
  }

  function parseSubtitleCatLanguageOptions(html) {
    const blocks = String(html || "").match(/<div\b[^>]*class="[^"]*\bsub-single\b[^"]*"[\s\S]*?<\/div>\s*<!--/gi)
      || String(html || "").match(/<div\b[^>]*class="[^"]*\bsub-single\b[^"]*"[\s\S]*?<\/div>/gi)
      || [];
    const languages = [];

    for (const block of blocks) {
      const downloadMatch = block.match(/<a\b[^>]*id="download_([^"]+)"[^>]*href="([^"]+\.srt)"[^>]*>[\s\S]*?<\/a>/i);
      if (!downloadMatch) {
        continue;
      }

      const spanMatches = Array.from(block.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi));
      const languageLabel = stripHtml(spanMatches[1]?.[1] || "");
      const languageCode = stripHtml(downloadMatch[1]);
      const downloadUrl = toAbsoluteSubtitleCatUrl(downloadMatch[2]);

      if (!languageLabel || !languageCode || !downloadUrl) {
        continue;
      }

      languages.push({
        languageCode,
        languageLabel,
        downloadUrl
      });
    }

    return languages;
  }

  async function downloadSubtitleFromUrl(url, fetchImpl = globalObject.fetch) {
    const trimmedUrl = String(url || "").trim();

    if (!trimmedUrl) {
      return {
        ok: false,
        error: "请输入字幕链接"
      };
    }

    if (typeof fetchImpl !== "function") {
      return {
        ok: false,
        error: "后台下载失败"
      };
    }

    try {
      const response = await fetchImpl(trimmedUrl);

      if (!response.ok) {
        return {
          ok: false,
          error: getResponseError("下载字幕失败", response)
        };
      }

      return {
        ok: true,
        content: await response.text()
      };
    } catch (error) {
      return {
        ok: false,
        error: `下载字幕失败：${error instanceof Error ? error.message : "未知错误"}`
      };
    }
  }

  async function searchSubtitleCat(keyword, fetchImpl = globalObject.fetch) {
    const trimmedKeyword = String(keyword || "").trim();

    if (!trimmedKeyword) {
      return {
        ok: false,
        error: "请输入搜索关键词"
      };
    }

    if (typeof fetchImpl !== "function") {
      return {
        ok: false,
        error: "字幕搜索不可用"
      };
    }

    try {
      const url = `${SUBTITLE_CAT_BASE_URL}/index.php?search=${encodeURIComponent(trimmedKeyword)}`;
      const response = await fetchImpl(url);

      if (!response.ok) {
        return {
          ok: false,
          error: getResponseError("搜索字幕失败", response)
        };
      }

      const results = parseSubtitleCatSearchResults(await response.text());

      if (results.length === 0) {
        return {
          ok: false,
          error: "没有找到匹配的字幕"
        };
      }

      return {
        ok: true,
        results
      };
    } catch (error) {
      return {
        ok: false,
        error: `搜索字幕失败：${error instanceof Error ? error.message : "未知错误"}`
      };
    }
  }

  async function fetchSubtitleCatLanguages(detailUrl, fetchImpl = globalObject.fetch) {
    const trimmedUrl = String(detailUrl || "").trim();

    if (!trimmedUrl) {
      return {
        ok: false,
        error: "请选择字幕条目"
      };
    }

    if (typeof fetchImpl !== "function") {
      return {
        ok: false,
        error: "字幕语言加载不可用"
      };
    }

    try {
      const response = await fetchImpl(trimmedUrl);

      if (!response.ok) {
        return {
          ok: false,
          error: getResponseError("加载字幕语言失败", response)
        };
      }

      const languages = parseSubtitleCatLanguageOptions(await response.text());

      if (languages.length === 0) {
        return {
          ok: false,
          error: "该条字幕暂无可下载语言"
        };
      }

      return {
        ok: true,
        languages
      };
    } catch (error) {
      return {
        ok: false,
        error: `加载字幕语言失败：${error instanceof Error ? error.message : "未知错误"}`
      };
    }
  }

  if (globalObject.chrome?.runtime?.onMessage) {
    globalObject.chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "vso-download-subtitle") {
        downloadSubtitleFromUrl(message.url).then((result) => {
          sendResponse(result);
        });

        return true;
      }

      if (message?.type === "vso-search-subtitlecat") {
        searchSubtitleCat(message.keyword).then((result) => {
          sendResponse(result);
        });

        return true;
      }

      if (message?.type === "vso-fetch-subtitlecat-languages") {
        fetchSubtitleCatLanguages(message.detailUrl).then((result) => {
          sendResponse(result);
        });

        return true;
      }

      return false;
    });
  }

  globalObject.__VSO_BACKGROUND__ = Object.assign(
    {},
    globalObject.__VSO_BACKGROUND__,
    {
      downloadSubtitleFromUrl,
      parseSubtitleCatSearchResults,
      parseSubtitleCatLanguageOptions,
      searchSubtitleCat,
      fetchSubtitleCatLanguages
    }
  );
})(globalThis);
