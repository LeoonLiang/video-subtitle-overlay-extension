(function attachVideoSubtitleOverlayHelpers(globalObject) {
  const SITE_STORAGE_KEY = "vso-enabled-sites";

  function getFullscreenElement(doc) {
    return (
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement ||
      null
    );
  }

  function resolveUiRoot(doc, activeVideo) {
    const fullscreenElement = getFullscreenElement(doc);

    if (
      fullscreenElement &&
      activeVideo &&
      typeof fullscreenElement.contains === "function" &&
      fullscreenElement.contains(activeVideo)
    ) {
      return fullscreenElement;
    }

    return doc.documentElement;
  }

  function getSiteHostname(url) {
    if (!url) {
      return "";
    }

    try {
      const parsedUrl = new URL(url);
      if (!/^https?:$/.test(parsedUrl.protocol)) {
        return "";
      }
      return parsedUrl.hostname || "";
    } catch (error) {
      return "";
    }
  }

  function isSiteEnabled(enabledSites, url) {
    const hostname = getSiteHostname(url);
    if (!hostname || !enabledSites || typeof enabledSites !== "object") {
      return false;
    }
    return enabledSites[hostname] === true;
  }

  function setSiteEnabled(enabledSites, url, enabled) {
    const hostname = getSiteHostname(url);
    const nextEnabledSites = {
      ...(enabledSites && typeof enabledSites === "object" ? enabledSites : {})
    };

    if (!hostname) {
      return nextEnabledSites;
    }

    if (enabled) {
      nextEnabledSites[hostname] = true;
    } else {
      delete nextEnabledSites[hostname];
    }

    return nextEnabledSites;
  }

  function supportsDynamicMenuTitle(contextMenusApi) {
    return Boolean(
      contextMenusApi &&
      contextMenusApi.onShown &&
      typeof contextMenusApi.onShown.addListener === "function" &&
      typeof contextMenusApi.refresh === "function"
    );
  }

  function shouldIgnoreMissingMenuError(message) {
    return /Cannot find menu item with id/i.test(String(message || ""));
  }

  function getSubtitleFilenameFromUrl(url) {
    if (!url) {
      return "remote-subtitle.srt";
    }

    try {
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname || "";
      const rawName = pathname.split("/").pop() || "";
      const decodedName = decodeURIComponent(rawName).trim();
      return decodedName || "remote-subtitle.srt";
    } catch (error) {
      return "remote-subtitle.srt";
    }
  }

  function formatDelayLabel(delayMs) {
    const safeDelayMs = Number.isFinite(delayMs) ? delayMs : 0;
    const seconds = safeDelayMs / 1000;
    const sign = seconds > 0 ? "+" : "";
    return `${sign}${seconds.toFixed(1)}s`;
  }

  function getPreviewTime(currentTime, delayMs) {
    const safeCurrentTime = Number.isFinite(currentTime) ? currentTime : 0;
    const safeDelayMs = Number.isFinite(delayMs) ? delayMs : 0;
    return safeCurrentTime + safeDelayMs / 1000;
  }

  function getSeekTimeForCue(cueStart, delayMs) {
    const safeCueStart = Number.isFinite(cueStart) ? cueStart : 0;
    const safeDelayMs = Number.isFinite(delayMs) ? delayMs : 0;
    return Math.max(0, safeCueStart - safeDelayMs / 1000);
  }

  function findCueIndexAtTime(cues, time) {
    if (!Array.isArray(cues) || cues.length === 0) {
      return -1;
    }

    let left = 0;
    let right = cues.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const cue = cues[mid];

      if (time < cue.start) {
        right = mid - 1;
      } else if (time > cue.end) {
        left = mid + 1;
      } else {
        return mid;
      }
    }

    return -1;
  }

  function getPreviewViewState({ cues, activeCueIndex, autoFollow }) {
    if (!Array.isArray(cues) || cues.length === 0) {
      return {
        mode: "empty",
        activeCueIndex: -1,
        showResumeButton: false
      };
    }

    return {
      mode: "list",
      activeCueIndex: Number.isInteger(activeCueIndex) ? activeCueIndex : -1,
      showResumeButton: autoFollow === false
    };
  }

  globalObject.__VSO_HELPERS__ = Object.assign(
    {},
    globalObject.__VSO_HELPERS__,
    {
      getFullscreenElement,
      resolveUiRoot,
      SITE_STORAGE_KEY,
      getSiteHostname,
      isSiteEnabled,
      setSiteEnabled,
      supportsDynamicMenuTitle,
      shouldIgnoreMissingMenuError,
      getSubtitleFilenameFromUrl,
      formatDelayLabel,
      getPreviewTime,
      getSeekTimeForCue,
      findCueIndexAtTime,
      getPreviewViewState
    }
  );
})(globalThis);
