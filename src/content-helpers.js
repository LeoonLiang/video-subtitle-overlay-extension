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
      shouldIgnoreMissingMenuError
    }
  );
})(globalThis);
