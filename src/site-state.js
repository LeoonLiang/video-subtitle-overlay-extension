(function attachVideoSubtitleOverlaySiteState(globalObject) {
  function startSiteStateSync(chromeApi, onChange) {
    const { SITE_STORAGE_KEY, isSiteEnabled } = globalObject.__VSO_HELPERS__;
    let revision = 0;

    function refresh() {
      const requestRevision = ++revision;
      const apply = (enabled, pageUrl = "") => {
        if (requestRevision === revision) onChange(enabled, pageUrl);
      };

      if (!chromeApi?.runtime?.sendMessage || !chromeApi?.storage?.local) {
        apply(false);
        return;
      }

      try {
        chromeApi.runtime.sendMessage({ type: "vso-get-site-context" }, (response) => {
          if (chromeApi.runtime.lastError || !response?.ok || !response.pageUrl) {
            apply(false);
            return;
          }
          if (requestRevision !== revision) return;

          chromeApi.storage.local.get(SITE_STORAGE_KEY, (result) => {
            apply(!chromeApi.runtime.lastError && isSiteEnabled(
              result?.[SITE_STORAGE_KEY], response.pageUrl
            ), response.pageUrl);
          });
        });
      } catch (error) {
        // The extension can be reloaded while an existing frame is still open.
        apply(false);
      }
    }

    chromeApi?.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName === "local" && changes[SITE_STORAGE_KEY]) refresh();
    });
    chromeApi?.runtime?.onMessage?.addListener((message) => {
      if (message?.type === "vso-site-status-changed") refresh();
    });
    refresh();
  }

  globalObject.__VSO_SITE_STATE__ = { startSiteStateSync };
})(globalThis);
