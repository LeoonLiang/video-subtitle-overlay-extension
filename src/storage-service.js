(function attachVideoSubtitleOverlayStorage(globalObject) {
  const SETTINGS = "vso-settings";
  const PAGES = "vso-page-memory";
  const HISTORY = "vso-subtitle-history";
  const FAVORITES = "vso-subtitle-favorites";
  const KEYS = [SETTINGS, PAGES, HISTORY, FAVORITES];
  const DEFAULT_SETTINGS = {
    textColor: "#ffffff",
    backgroundColor: "#000000",
    backgroundOpacity: 0.55,
    fontSize: 16,
    delayMs: 0,
    keepRecords: false
  };

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function requiredString(value, name) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${name} is required`);
    }
    return value;
  }

  function validSettingsPatch(patch) {
    if (!isObject(patch)) {
      throw new Error("settings patch is required");
    }
    for (const [key, value] of Object.entries(patch)) {
      if (key === "textColor" || key === "backgroundColor") {
        if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
          throw new Error(`${key} must be a hex color`);
        }
      } else if (key === "backgroundOpacity") {
        if (!Number.isFinite(value) || value < 0 || value > 1) {
          throw new Error("backgroundOpacity must be between 0 and 1");
        }
      } else if (key === "fontSize") {
        if (!Number.isInteger(value) || value < 16 || value > 64) {
          throw new Error("fontSize must be between 16 and 64");
        }
      } else if (key === "keepRecords") {
        if (typeof value !== "boolean") {
          throw new Error("keepRecords must be boolean");
        }
      } else {
        throw new Error(`Unsupported setting: ${key}`);
      }
    }
  }

  function createStorageService(chromeApi) {
    const helpers = globalObject.__VSO_HELPERS__ || {};
    let queue = Promise.resolve();

    function read() {
      return new Promise((resolve, reject) => {
        chromeApi.storage.local.get(KEYS, (items) => {
          const error = chromeApi.runtime?.lastError;
          if (error) {
            reject(new Error(error.message || "Storage read failed"));
          } else {
            resolve(items || {});
          }
        });
      });
    }

    function write(changes) {
      return new Promise((resolve, reject) => {
        chromeApi.storage.local.set(changes, () => {
          const error = chromeApi.runtime?.lastError;
          if (error) {
            reject(new Error(error.message || "Storage write failed"));
          } else {
            resolve();
          }
        });
      });
    }

    async function execute(message) {
      const raw = await read();
      const snapshot = {
        [SETTINGS]: { ...DEFAULT_SETTINGS, ...(isObject(raw[SETTINGS]) ? raw[SETTINGS] : {}) },
        [PAGES]: isObject(raw[PAGES]) ? raw[PAGES] : {},
        [HISTORY]: Array.isArray(raw[HISTORY]) ? raw[HISTORY] : [],
        [FAVORITES]: Array.isArray(raw[FAVORITES]) ? raw[FAVORITES] : []
      };
      const changes = {};
      const setIfChanged = (key, value) => {
        if (!same(snapshot[key], value)) {
          snapshot[key] = value;
          changes[key] = value;
        }
      };

      // Legacy persisted collections are cleaned when privacy is the default.
      if (snapshot[SETTINGS].keepRecords !== true) {
        setIfChanged(PAGES, {});
        setIfChanged(HISTORY, []);
      }

      switch (message?.action) {
        case "snapshot":
          break;
        case "settings.patch": {
          validSettingsPatch(message.patch);
          const next = { ...snapshot[SETTINGS], ...message.patch };
          setIfChanged(SETTINGS, next);
          if (message.patch.keepRecords === false) {
            setIfChanged(PAGES, {});
            setIfChanged(HISTORY, []);
            setIfChanged(FAVORITES, []);
          }
          break;
        }
        case "page.upsert": {
          const pageUrl = requiredString(message.pageUrl, "pageUrl");
          if (!isObject(message.record)) {
            throw new Error("page record is required");
          }
          if (message.record.timingRate !== undefined &&
              (!Number.isFinite(message.record.timingRate) || message.record.timingRate <= 0)) {
            throw new Error("timingRate must be positive and finite");
          }
          if (snapshot[SETTINGS].keepRecords === true) {
            const next = helpers.upsertPageMemoryEntry(snapshot[PAGES], pageUrl, message.record);
            const previousRate = snapshot[PAGES][pageUrl]?.timingRate;
            next[pageUrl].timingRate = message.record.timingRate === undefined
              ? (Number.isFinite(previousRate) && previousRate > 0 ? previousRate : 1)
              : message.record.timingRate;
            setIfChanged(PAGES, next);
          }
          break;
        }
        case "page.remove": {
          const pageUrl = requiredString(message.pageUrl, "pageUrl");
          if (Object.hasOwn(snapshot[PAGES], pageUrl)) {
            const next = { ...snapshot[PAGES] };
            delete next[pageUrl];
            setIfChanged(PAGES, next);
          }
          break;
        }
        case "history.upsert":
          if (!isObject(message.entry)) throw new Error("history entry is required");
          if (snapshot[SETTINGS].keepRecords === true) {
            setIfChanged(HISTORY, helpers.upsertSubtitleHistoryEntry(snapshot[HISTORY], message.entry, 50));
          }
          break;
        case "history.remove":
          setIfChanged(HISTORY, helpers.removeSubtitleListEntry(snapshot[HISTORY], requiredString(message.id, "id")));
          break;
        case "history.clear":
          setIfChanged(HISTORY, []);
          break;
        case "favorites.add":
          if (!isObject(message.entry)) throw new Error("favorite entry is required");
          setIfChanged(FAVORITES, helpers.upsertSubtitleFavoriteEntry(snapshot[FAVORITES], message.entry));
          break;
        case "favorites.remove":
          setIfChanged(FAVORITES, helpers.removeSubtitleListEntry(snapshot[FAVORITES], requiredString(message.id, "id")));
          break;
        case "favorites.clear":
          setIfChanged(FAVORITES, []);
          break;
        case "records.clear":
          if (typeof message.includeFavorites !== "boolean") throw new Error("includeFavorites must be boolean");
          setIfChanged(PAGES, {});
          setIfChanged(HISTORY, []);
          if (message.includeFavorites) setIfChanged(FAVORITES, []);
          break;
        default:
          throw new Error("Unsupported storage action");
      }

      if (Object.keys(changes).length > 0) {
        await write(changes);
      }
      return { ok: true, snapshot };
    }

    return function dispatch(message) {
      const result = queue.then(() => execute(message));
      queue = result.catch(() => {});
      return result.catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    };
  }

  globalObject.__VSO_STORAGE__ = Object.assign({}, globalObject.__VSO_STORAGE__, { createStorageService });
})(globalThis);
