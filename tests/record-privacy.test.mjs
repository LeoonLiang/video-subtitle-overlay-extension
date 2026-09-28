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

// Authoritative privacy clearing and concurrent stale writes are covered by
// storage-service.test.mjs. They no longer live in content-script functions.

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
