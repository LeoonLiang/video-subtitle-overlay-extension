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

  function buildPageMemoryRecord({ delayMs, subtitleSource, updatedAt }) {
    return {
      delayMs: Number.isFinite(delayMs) ? delayMs : 0,
      subtitleSource: subtitleSource && typeof subtitleSource === "object"
        ? { ...subtitleSource }
        : null,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now()
    };
  }

  function upsertPageMemoryEntry(entries, pageUrl, record) {
    const nextEntries = entries && typeof entries === "object" ? { ...entries } : {};

    if (!pageUrl) {
      return nextEntries;
    }

    if (!record || typeof record !== "object") {
      delete nextEntries[pageUrl];
      return nextEntries;
    }

    nextEntries[pageUrl] = {
      delayMs: Number.isFinite(record.delayMs) ? record.delayMs : 0,
      subtitleSource: record.subtitleSource && typeof record.subtitleSource === "object"
        ? { ...record.subtitleSource }
        : null,
      updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now()
    };

    return nextEntries;
  }

  function normalizeSubtitleList(list) {
    return Array.isArray(list) ? list.filter(Boolean) : [];
  }

  function getSubtitleSourceIdentity(entry, mode = "history") {
    if (!entry || typeof entry !== "object") {
      return "";
    }

    const kind = String(entry.kind || "").trim();
    const pageUrl = String(entry.pageUrl || "").trim();
    const url = String(entry.url || "").trim();
    const label = String(entry.label || "").trim();

    if ((kind === "remote" || kind === "subtitlecat") && url) {
      if (mode === "favorite") {
        return `${kind}|${url}`;
      }
      return `${kind}|${pageUrl}|${url}`;
    }

    if (kind === "local" && label) {
      if (mode === "favorite") {
        return `${kind}|${label}`;
      }
      return `${kind}|${pageUrl}|${label}`;
    }

    return `${kind}|${url || label}`;
  }

  function upsertSubtitleListEntry(list, entry, limit = Number.POSITIVE_INFINITY, mode = "history") {
    const normalizedList = normalizeSubtitleList(list);

    if (!entry || typeof entry !== "object") {
      return normalizedList.slice(0, Number.isFinite(limit) ? limit : normalizedList.length);
    }

    const entryIdentity = getSubtitleSourceIdentity(entry, mode);
    const nextList = [
      { ...entry },
      ...normalizedList.filter((item) => getSubtitleSourceIdentity(item, mode) !== entryIdentity)
    ];

    if (!Number.isFinite(limit) || limit < 0) {
      return nextList;
    }

    return nextList.slice(0, limit);
  }

  function upsertSubtitleHistoryEntry(list, entry, limit = 50) {
    return upsertSubtitleListEntry(list, entry, limit, "history");
  }

  function upsertSubtitleFavoriteEntry(list, entry) {
    return upsertSubtitleListEntry(list, entry, Number.POSITIVE_INFINITY, "favorite");
  }

  function removeSubtitleListEntry(list, entryId) {
    return normalizeSubtitleList(list).filter((entry) => entry?.id !== entryId);
  }

  function clearSubtitleList() {
    return [];
  }

  function isShortcutEventAllowed(event) {
    if (!event || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }

    const target = event.target;
    if (!target || typeof target !== "object") {
      return true;
    }

    if (target.isContentEditable) {
      return false;
    }

    if (typeof target.closest === "function" && target.closest("input, textarea, [contenteditable=\"true\"]")) {
      return false;
    }

    return true;
  }

  function formatShortcutToastMessage(action, deltaMs, currentDelayLabel, visible) {
    if (action === "delay") {
      const normalizedDelta = Number.isFinite(deltaMs) ? deltaMs : 0;
      const deltaLabel = `${normalizedDelta > 0 ? "+" : ""}${(normalizedDelta / 1000).toFixed(1)}s`;
      return `字幕${normalizedDelta >= 0 ? "延后" : "提前"} ${deltaLabel}，当前 ${currentDelayLabel || "0.0s"}`;
    }

    if (action === "toggle-visibility") {
      return visible ? "字幕已显示" : "字幕已隐藏";
    }

    if (action === "toggle-panel") {
      return "已打开字幕面板";
    }

    return "";
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
      getPreviewViewState,
      buildPageMemoryRecord,
      upsertPageMemoryEntry,
      upsertSubtitleHistoryEntry,
      upsertSubtitleFavoriteEntry,
      removeSubtitleListEntry,
      clearSubtitleList,
      isShortcutEventAllowed,
      formatShortcutToastMessage
    }
  );
})(globalThis);
