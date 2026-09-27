import assert from "assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../src/content-helpers.js";

const {
  DEFAULT_KEEP_RECORDS,
  shouldKeepRecords
} = globalThis.__VSO_HELPERS__ || {};

assert.ok(shouldKeepRecords, "shouldKeepRecords should be defined");

assert.strictEqual(
  DEFAULT_KEEP_RECORDS,
  false,
  "records should not be kept by default"
);

assert.strictEqual(
  shouldKeepRecords({ keepRecords: false }),
  false,
  "should not keep records when the privacy switch is on"
);

assert.strictEqual(
  shouldKeepRecords({ keepRecords: true }),
  true,
  "should keep records once the privacy switch is turned off"
);

assert.strictEqual(
  shouldKeepRecords({}),
  false,
  "should treat a missing setting as the privacy default"
);

assert.strictEqual(
  shouldKeepRecords(undefined),
  false,
  "should treat missing settings as the privacy default"
);

const contentSource = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/content.js"),
  "utf8"
);

assert.ok(
  /keepRecords:\s*false/.test(contentSource),
  "default settings should ship with record keeping disabled"
);

for (const guard of [
  "function persistCurrentPageMemory()",
  "function persistSubtitleUsage(source)"
]) {
  const start = contentSource.indexOf(guard);
  assert.ok(start >= 0, `${guard} should exist`);

  const body = contentSource.slice(start, contentSource.indexOf("\n  }", start));
  assert.ok(
    body.includes("shouldKeepRecords()"),
    `${guard} should skip writing while records are disabled`
  );
}

const clearSubtitleBody = contentSource.slice(
  contentSource.indexOf("function clearCurrentSubtitle()")
);
assert.ok(
  clearSubtitleBody.slice(0, 600).includes("shouldKeepRecords()"),
  "clearing the current subtitle should not write page memory while records are disabled"
);

const clearRecordsBody = contentSource.slice(
  contentSource.indexOf("function clearStoredRecords("),
  contentSource.indexOf("function enforcePrivacyOnLoad()")
);
assert.ok(
  clearRecordsBody.includes("includeFavorites"),
  "clearing stored records should decide separately whether favorites are wiped"
);

const enforceBody = contentSource.slice(
  contentSource.indexOf("function enforcePrivacyOnLoad()"),
  contentSource.indexOf("function clearCurrentPageMemory()")
);
assert.ok(
  enforceBody.includes("includeFavorites: false"),
  "the privacy pass on load must not wipe favorites on every page load"
);
assert.ok(
  enforceBody.includes("!state.settingsLoaded || !state.libraryLoaded"),
  "the privacy pass should wait until settings and records are both loaded"
);
assert.ok(
  enforceBody.includes("hasStoredRecords"),
  "the privacy pass should only write storage when there is something to clear"
);

const favoriteToggleBody = contentSource.slice(
  contentSource.indexOf("function toggleFavoriteEntry(entry)"),
  contentSource.indexOf("function applyKeepRecordsSetting(")
);
assert.ok(
  !favoriteToggleBody.includes("shouldKeepRecords()"),
  "favorites should keep working while record keeping is disabled"
);

// 面板模板里新增的控件必须真的能被 querySelector 到。
const panelTemplate = contentSource.slice(
  contentSource.indexOf("panel.innerHTML = `"),
  contentSource.indexOf("`;", contentSource.indexOf("panel.innerHTML = `"))
);

const queriedIds = Array.from(
  contentSource.matchAll(/querySelector\("#([\w-]+)"\)/g),
  (match) => match[1]
);
const missingIds = queriedIds.filter(
  (id) => !panelTemplate.includes(`id="${id}"`)
);

assert.deepStrictEqual(
  missingIds,
  [],
  `every queried panel id should exist in the panel template (missing: ${missingIds.join(", ")})`
);

for (const requiredId of ["vso-records-clear-all", "vso-keep-records"]) {
  assert.ok(
    panelTemplate.includes(`id="${requiredId}"`),
    `panel template should contain ${requiredId}`
  );
}

assert.ok(
  /清空全部记录/.test(panelTemplate),
  "the library panel should offer a one click clear for all records"
);

assert.ok(
  /不保留任何记录/.test(panelTemplate),
  "the settings panel should offer the privacy switch"
);

console.log("record-privacy tests passed");
