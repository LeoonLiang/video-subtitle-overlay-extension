import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import "../src/content-helpers.js";
import "../src/storage-service.js";

const SETTINGS = "vso-settings";
const PAGES = "vso-page-memory";
const HISTORY = "vso-subtitle-history";
const FAVORITES = "vso-subtitle-favorites";

function storage(initial = {}) {
  const data = structuredClone(initial);
  const chromeApi = {
    runtime: { lastError: null },
    storage: { local: {
      get(keys, callback) {
        queueMicrotask(() => {
          if (chromeApi.failNextGet) {
            chromeApi.runtime.lastError = { message: "get failed" };
            chromeApi.failNextGet = false;
            callback({});
            chromeApi.runtime.lastError = null;
            return;
          }
          callback(Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, structuredClone(data[key])])));
        });
      },
      set(items, callback) {
        queueMicrotask(() => {
          if (chromeApi.failNextSet) {
            chromeApi.runtime.lastError = { message: "set failed" };
            chromeApi.failNextSet = false;
            callback();
            chromeApi.runtime.lastError = null;
            return;
          }
          Object.assign(data, structuredClone(items));
          chromeApi.writes.push(structuredClone(items));
          callback();
        });
      }
    } },
    writes: [],
    failNextGet: false,
    failNextSet: false
  };
  return { chromeApi, data };
}

function service(initial) {
  const fixture = storage(initial);
  fixture.dispatch = globalThis.__VSO_STORAGE__.createStorageService(fixture.chromeApi);
  return fixture;
}

const a = { id: "a", kind: "remote", pageUrl: "https://a.test", url: "https://a.test/a.srt", label: "A" };
const b = { id: "b", kind: "remote", pageUrl: "https://b.test", url: "https://b.test/b.srt", label: "B" };

{
  const { dispatch, data, chromeApi } = service({ [SETTINGS]: { keepRecords: true } });
  const [first, second] = await Promise.all([
    dispatch({ action: "settings.patch", patch: { textColor: "#ff0000" } }),
    dispatch({ action: "settings.patch", patch: { fontSize: 20 } })
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(data[SETTINGS].textColor, "#ff0000", "concurrent patches retain the first field");
  assert.equal(data[SETTINGS].fontSize, 20, "concurrent patches retain the second field");
  assert.equal(second.snapshot[SETTINGS].textColor, "#ff0000");
  const before = chromeApi.writes.length;
  await dispatch({ action: "settings.patch", patch: { fontSize: 20 } });
  assert.equal(chromeApi.writes.length, before, "a no-op patch does not trigger storage change feedback");
}

{
  const { dispatch, data } = service({ [SETTINGS]: { keepRecords: true }, [PAGES]: { old: { delayMs: 3 } } });
  await Promise.all([
    dispatch({ action: "history.upsert", entry: a }),
    dispatch({ action: "history.upsert", entry: b }),
    dispatch({ action: "page.upsert", pageUrl: "new", record: { delayMs: 120, timingRate: 1.12 } })
  ]);
  assert.deepEqual(data[HISTORY].map((entry) => entry.id), ["b", "a"], "concurrent additions survive");
  assert.deepEqual(data[PAGES].old, { delayMs: 3 }, "page upsert retains unrelated records");
  assert.equal(data[PAGES].new.timingRate, 1.12, "positive timing rate persists");
  await dispatch({ action: "page.upsert", pageUrl: "new", record: { delayMs: 140 } });
  assert.equal(data[PAGES].new.timingRate, 1.12, "updating page memory retains an existing timing rate");
  await dispatch({ action: "page.upsert", pageUrl: "another", record: { delayMs: 20 } });
  assert.equal(data[PAGES].another.timingRate, 1, "new page memory defaults to normal playback rate");
  await dispatch({ action: "history.remove", id: "b" });
  await dispatch({ action: "page.remove", pageUrl: "new" });
  assert.deepEqual(data[HISTORY].map((entry) => entry.id), ["a"]);
  assert.deepEqual(Object.keys(data[PAGES]), ["old", "another"]);
}

{
  const { dispatch, data } = service({ [SETTINGS]: { keepRecords: true } });
  for (let i = 0; i < 51; i += 1) {
    await dispatch({ action: "history.upsert", entry: { ...a, id: `id-${i}`, url: `https://a.test/${i}.srt` } });
  }
  assert.equal(data[HISTORY].length, 50, "history has a 50-entry limit");
  await dispatch({ action: "favorites.add", entry: a });
  await dispatch({ action: "favorites.add", entry: { ...a, id: "newer" } });
  assert.deepEqual(data[FAVORITES].map((entry) => entry.id), ["newer"], "favorite source identity deduplicates");
}

{
  const { dispatch, data } = service({
    [SETTINGS]: { keepRecords: true }, [PAGES]: { old: { delayMs: 3 } }, [HISTORY]: [a], [FAVORITES]: [a]
  });
  const result = await dispatch({ action: "settings.patch", patch: { keepRecords: false } });
  assert.equal(result.ok, true);
  assert.deepEqual(data[PAGES], {});
  assert.deepEqual(data[HISTORY], []);
  assert.deepEqual(data[FAVORITES], [], "explicit privacy enable clears favorites");
  await dispatch({ action: "history.upsert", entry: b });
  await dispatch({ action: "page.upsert", pageUrl: "stale", record: { delayMs: 5 } });
  assert.deepEqual(data[HISTORY], [], "stale history write is blocked");
  assert.deepEqual(data[PAGES], {}, "stale page write is blocked");
}

{
  const { dispatch, data, chromeApi } = service({ [HISTORY]: [a], [PAGES]: { old: {} }, [FAVORITES]: [b] });
  const first = await dispatch({ action: "snapshot" });
  assert.equal(first.snapshot[SETTINGS].keepRecords, false, "privacy defaults to disabled records");
  assert.deepEqual(first.snapshot[PAGES], {});
  assert.deepEqual(first.snapshot[HISTORY], []);
  assert.deepEqual(first.snapshot[FAVORITES], [b], "default privacy cleanup preserves favorites");
  const writes = chromeApi.writes.length;
  await dispatch({ action: "snapshot" });
  assert.equal(chromeApi.writes.length, writes, "clean snapshot does not write");
  await dispatch({ action: "records.clear", includeFavorites: true });
  assert.deepEqual(data[FAVORITES], [], "explicit clear includes favorites when requested");
}

{
  const { dispatch, data, chromeApi } = service({ [SETTINGS]: { keepRecords: true } });
  chromeApi.failNextSet = true;
  const failed = await dispatch({ action: "history.upsert", entry: a });
  assert.deepEqual(failed, { ok: false, error: "set failed" });
  assert.equal((await dispatch({ action: "history.upsert", entry: b })).ok, true, "failed write does not poison queue");
  assert.deepEqual(data[HISTORY].map((entry) => entry.id), ["b"]);
  chromeApi.failNextGet = true;
  assert.deepEqual(await dispatch({ action: "snapshot" }), { ok: false, error: "get failed" });
  assert.equal((await dispatch({ action: "snapshot" })).ok, true, "failed read does not poison queue");
}

{
  const { dispatch, data, chromeApi } = service({ [SETTINGS]: { keepRecords: true } });
  assert.equal((await dispatch({ action: "bogus" })).ok, false);
  assert.equal((await dispatch({ action: "settings.patch", patch: { fontSize: Infinity } })).ok, false);
  assert.equal((await dispatch({ action: "settings.patch", patch: { madeUp: 1 } })).ok, false);
  assert.equal((await dispatch({ action: "page.upsert", pageUrl: "x", record: { timingRate: -1 } })).ok, false);
  assert.equal((await dispatch({ action: "history.remove", id: "" })).ok, false);
  assert.deepEqual(data[SETTINGS], { keepRecords: true });
  assert.equal(chromeApi.writes.length, 0, "invalid commands do not mutate storage");
}

{
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src");
  const { chromeApi } = storage({ [SETTINGS]: { keepRecords: true } });
  let listener;
  chromeApi.runtime.onMessage = { addListener(value) { listener = value; } };
  const context = vm.createContext({ chrome: chromeApi, URL, fetch: globalThis.fetch });
  context.importScripts = (...names) => {
    for (const name of names) vm.runInContext(fs.readFileSync(path.join(root, name), "utf8"), context);
  };
  vm.runInContext(fs.readFileSync(path.join(root, "background.js"), "utf8"), context);
  const response = await new Promise((resolve) => {
    assert.equal(listener({ type: "vso-storage-action", action: "settings.patch", patch: { fontSize: 23 } }, {}, resolve), true);
  });
  assert.equal(response.ok, true, "background routes storage commands to the service");
  assert.equal(response.snapshot[SETTINGS].fontSize, 23);
}

console.log("storage-service tests passed");
