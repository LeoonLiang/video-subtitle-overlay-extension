(() => {
  const helpers = globalThis.__VSO_HELPERS__ || {};
  const SITE_STORAGE_KEY = helpers.SITE_STORAGE_KEY || "vso-enabled-sites";
  const getSiteHostname = typeof helpers.getSiteHostname === "function"
    ? helpers.getSiteHostname
    : () => "";
  const isSiteEnabled = typeof helpers.isSiteEnabled === "function"
    ? helpers.isSiteEnabled
    : () => false;
  const setSiteEnabled = typeof helpers.setSiteEnabled === "function"
    ? helpers.setSiteEnabled
    : (enabledSites) => enabledSites || {};

  const ui = {
    site: document.querySelector("#vso-popup-site"),
    enabled: document.querySelector("#vso-popup-enabled"),
    status: document.querySelector("#vso-popup-status")
  };

  let currentTab = null;
  let currentHostname = "";

  function setStatus(message) {
    ui.status.textContent = message;
  }

  function getCurrentTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0] || null);
      });
    });
  }

  function getEnabledSites() {
    return new Promise((resolve) => {
      chrome.storage.local.get(SITE_STORAGE_KEY, (result) => {
        if (chrome.runtime?.lastError) {
          resolve({});
          return;
        }
        resolve(result[SITE_STORAGE_KEY] || {});
      });
    });
  }

  function saveEnabledSites(enabledSites) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [SITE_STORAGE_KEY]: enabledSites }, () => {
        resolve();
      });
    });
  }

  function notifyTab(enabled) {
    if (typeof currentTab?.id !== "number") {
      return;
    }

    chrome.tabs.sendMessage(currentTab.id, {
      type: "vso-site-status-changed",
      enabled
    }, () => {
      void chrome.runtime?.lastError;
    });
  }

  async function render() {
    currentTab = await getCurrentTab();
    currentHostname = getSiteHostname(currentTab?.url);

    if (!currentHostname) {
      ui.site.textContent = "当前页面不支持";
      ui.enabled.checked = false;
      ui.enabled.disabled = true;
      setStatus("只能在普通网页中切换站点开关");
      return;
    }

    const enabledSites = await getEnabledSites();
    const enabled = isSiteEnabled(enabledSites, currentTab.url);

    ui.site.textContent = currentHostname;
    ui.enabled.checked = enabled;
    ui.enabled.disabled = false;
    setStatus(enabled ? "当前网站已启用" : "当前网站未启用");
  }

  ui.enabled.addEventListener("change", async () => {
    if (!currentHostname || !currentTab?.url) {
      return;
    }

    ui.enabled.disabled = true;

    const enabledSites = await getEnabledSites();
    const nextEnabled = ui.enabled.checked;
    const nextEnabledSites = setSiteEnabled(
      enabledSites,
      currentTab.url,
      nextEnabled
    );

    await saveEnabledSites(nextEnabledSites);
    notifyTab(nextEnabled);
    setStatus(nextEnabled ? "当前网站已启用" : "当前网站已禁用");
    ui.enabled.disabled = false;
  });

  render();
})();
