(function attachVideoSubtitleOverlayBackground(globalObject) {
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
        const suffix = response.statusText
          ? `${response.status} ${response.statusText}`
          : String(response.status);
        return {
          ok: false,
          error: `下载字幕失败（${suffix}）`
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

  if (globalObject.chrome?.runtime?.onMessage) {
    globalObject.chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type !== "vso-download-subtitle") {
        return false;
      }

      downloadSubtitleFromUrl(message.url).then((result) => {
        sendResponse(result);
      });

      return true;
    });
  }

  globalObject.__VSO_BACKGROUND__ = Object.assign(
    {},
    globalObject.__VSO_BACKGROUND__,
    {
      downloadSubtitleFromUrl
    }
  );
})(globalThis);
