import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const readSource = (name) => fs.readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");

// The browser-provided sender identifies the outer page, even for nested,
// cross-origin or blank frames. Never trust a URL supplied by the frame.
let backgroundListener;
vm.runInNewContext(readSource("background.js"), {
  URL,
  chrome: { runtime: { onMessage: { addListener(fn) { backgroundListener = fn; } } } }
});

for (const [sender, expected] of [
  [{ tab: { id: 7, url: "https://watch.example/episode/1" }, frameId: 3, url: "https://player.example/embed" }, "https://watch.example/episode/1"],
  [{ tab: { id: 7, url: "https://watch.example/episode/2" }, frameId: 12, url: "about:srcdoc" }, "https://watch.example/episode/2"],
  [{ tab: { id: 7, url: "https://watch.example/episode/3" }, frameId: 0 }, "https://watch.example/episode/3"],
  [{ url: "https://player.example/embed" }, null],
  [{ tab: { id: 7, url: "chrome://settings" } }, null]
]) {
  const response = await new Promise((resolve) => {
    const keepAlive = backgroundListener(
      { type: "vso-get-site-context", pageUrl: "https://spoofed.example" }, sender, resolve
    );
    if (!keepAlive) resolve(undefined);
  });
  assert.equal(response?.ok, expected !== null, "frame context must be resolved using the owning tab");
  if (expected) assert.equal(response.pageUrl, expected);
}

function createFrame({ sites = {}, pageUrl = "https://watch.example/episode/1", deferred = false, unavailable = false } = {}) {
  const pending = [];
  const changes = [];
  let messageListener;
  let storageListener;
  const chrome = {
    runtime: {
      onMessage: { addListener(fn) { messageListener = fn; } },
      sendMessage(message, callback) {
        assert.equal(message.type, "vso-get-site-context");
        if (unavailable) {
          chrome.runtime.lastError = { message: "background unavailable" };
          callback();
          delete chrome.runtime.lastError;
        } else {
          callback({ ok: true, pageUrl });
        }
      }
    },
    storage: {
      local: {
        get(key, callback) {
          assert.equal(key, "vso-enabled-sites");
          const snapshot = { [key]: { ...sites } };
          if (deferred) pending.push(() => callback(snapshot));
          else callback(snapshot);
        }
      },
      onChanged: { addListener(fn) { storageListener = fn; } }
    }
  };
  const context = vm.createContext({ URL, chrome });
  vm.runInContext(readSource("content-helpers.js"), context);
  vm.runInContext(readSource("site-state.js"), context);
  context.__VSO_SITE_STATE__.startSiteStateSync(chrome, (enabled) => changes.push(enabled));
  return {
    changes,
    pending,
    update(nextSites, area = "local") {
      sites = nextSites;
      storageListener({ "vso-enabled-sites": { newValue: sites } }, area);
    },
    notify(nextSites) {
      sites = nextSites;
      messageListener({ type: "vso-site-status-changed", enabled: true });
    }
  };
}

assert.deepEqual(createFrame({ sites: { "watch.example": true } }).changes, [true]);
assert.deepEqual(createFrame({ sites: { "player.example": true } }).changes, [false]);
assert.deepEqual(createFrame({ unavailable: true }).changes, [false]);
assert.deepEqual(createFrame({ pageUrl: "", sites: { "watch.example": true } }).changes, [false]);

{
  const frame = createFrame({ sites: { "watch.example": true } });
  frame.update({});
  frame.update({ "watch.example": true });
  frame.update({}, "sync");
  frame.notify({});
  assert.deepEqual(frame.changes, [true, false, true, false], "all frames follow storage; notifications re-read the authoritative switch");
}

{
  const frame = createFrame({ sites: { "watch.example": true }, deferred: true });
  frame.update({});
  frame.pending[1]();
  frame.pending[0]();
  assert.deepEqual(frame.changes, [false], "a late initial read must not re-enable a disabled site");
}

console.log("iframe-site-state tests passed");
