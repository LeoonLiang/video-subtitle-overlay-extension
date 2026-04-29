import assert from "assert";
import "../src/content-helpers.js";

const {
  buildPageMemoryRecord,
  upsertPageMemoryEntry,
  upsertSubtitleHistoryEntry,
  upsertSubtitleFavoriteEntry,
  removeSubtitleListEntry,
  clearSubtitleList,
  isShortcutEventAllowed,
  formatShortcutToastMessage
} = globalThis.__VSO_HELPERS__ || {};

assert.ok(buildPageMemoryRecord, "buildPageMemoryRecord should be defined");
assert.ok(upsertPageMemoryEntry, "upsertPageMemoryEntry should be defined");
assert.ok(upsertSubtitleHistoryEntry, "upsertSubtitleHistoryEntry should be defined");
assert.ok(upsertSubtitleFavoriteEntry, "upsertSubtitleFavoriteEntry should be defined");
assert.ok(removeSubtitleListEntry, "removeSubtitleListEntry should be defined");
assert.ok(clearSubtitleList, "clearSubtitleList should be defined");
assert.ok(isShortcutEventAllowed, "isShortcutEventAllowed should be defined");
assert.ok(formatShortcutToastMessage, "formatShortcutToastMessage should be defined");

const remoteSource = {
  kind: "remote",
  label: "movie-zh.srt",
  url: "https://example.com/movie-zh.srt",
  sourceSite: "example.com"
};

assert.deepStrictEqual(
  buildPageMemoryRecord({
    delayMs: 500,
    subtitleSource: remoteSource,
    updatedAt: 1234
  }),
  {
    delayMs: 500,
    subtitleSource: remoteSource,
    updatedAt: 1234
  },
  "should build a page memory record with the provided subtitle source"
);

assert.deepStrictEqual(
  upsertPageMemoryEntry(
    {
      "https://old.example/video": {
        delayMs: 0,
        subtitleSource: remoteSource,
        updatedAt: 10
      }
    },
    "https://example.com/watch/1",
    buildPageMemoryRecord({
      delayMs: -500,
      subtitleSource: {
        kind: "subtitlecat",
        label: "movie-zh-CN.srt",
        url: "https://www.subtitlecat.com/subs/1/movie-zh-CN.srt",
        sourceSite: "subtitlecat.com"
      },
      updatedAt: 2000
    })
  ),
  {
    "https://old.example/video": {
      delayMs: 0,
      subtitleSource: remoteSource,
      updatedAt: 10
    },
    "https://example.com/watch/1": {
      delayMs: -500,
      subtitleSource: {
        kind: "subtitlecat",
        label: "movie-zh-CN.srt",
        url: "https://www.subtitlecat.com/subs/1/movie-zh-CN.srt",
        sourceSite: "subtitlecat.com"
      },
      updatedAt: 2000
    }
  },
  "should upsert page memory by page URL"
);

const now = 1700000000000;
const historyResult = upsertSubtitleHistoryEntry(
  [
    {
      id: "older",
      kind: "remote",
      label: "old.srt",
      url: "https://example.com/old.srt",
      sourceSite: "example.com",
      pageUrl: "https://example.com/watch/0",
      createdAt: now - 5000
    },
    {
      id: "duplicate-old",
      kind: "remote",
      label: "movie-zh.srt",
      url: "https://example.com/movie-zh.srt",
      sourceSite: "example.com",
      pageUrl: "https://example.com/watch/1",
      createdAt: now - 1000
    }
  ],
  {
    id: "duplicate-new",
    kind: "remote",
    label: "movie-zh.srt",
    url: "https://example.com/movie-zh.srt",
    sourceSite: "example.com",
    pageUrl: "https://example.com/watch/1",
    createdAt: now
  },
  2
);

assert.deepStrictEqual(
  historyResult,
  [
    {
      id: "duplicate-new",
      kind: "remote",
      label: "movie-zh.srt",
      url: "https://example.com/movie-zh.srt",
      sourceSite: "example.com",
      pageUrl: "https://example.com/watch/1",
      createdAt: now
    },
    {
      id: "older",
      kind: "remote",
      label: "old.srt",
      url: "https://example.com/old.srt",
      sourceSite: "example.com",
      pageUrl: "https://example.com/watch/0",
      createdAt: now - 5000
    }
  ],
  "should dedupe remote history entries by page URL and subtitle URL and keep newest first"
);

assert.deepStrictEqual(
  upsertSubtitleFavoriteEntry(
    [
      {
        id: "favorite-1",
        kind: "remote",
        label: "movie-zh.srt",
        url: "https://example.com/movie-zh.srt",
        sourceSite: "example.com",
        pageUrl: "https://example.com/watch/1",
        createdAt: now - 1000
      }
    ],
    {
      id: "favorite-2",
      kind: "remote",
      label: "movie-zh.srt",
      url: "https://example.com/movie-zh.srt",
      sourceSite: "example.com",
      pageUrl: "https://example.com/watch/2",
      createdAt: now
    }
  ),
  [
    {
      id: "favorite-2",
      kind: "remote",
      label: "movie-zh.srt",
      url: "https://example.com/movie-zh.srt",
      sourceSite: "example.com",
      pageUrl: "https://example.com/watch/2",
      createdAt: now
    }
  ],
  "should dedupe favorites by subtitle source and keep the newest saved entry"
);

assert.deepStrictEqual(
  removeSubtitleListEntry(
    [
      { id: "a", label: "one" },
      { id: "b", label: "two" }
    ],
    "a"
  ),
  [
    { id: "b", label: "two" }
  ],
  "should remove a single subtitle list entry by id"
);

assert.deepStrictEqual(
  clearSubtitleList([{ id: "a" }]),
  [],
  "should clear subtitle lists"
);

assert.strictEqual(
  isShortcutEventAllowed({
    key: "s",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: {
      isContentEditable: false,
      closest: () => null
    }
  }),
  true,
  "should allow shortcuts for normal page targets without modifiers"
);

assert.strictEqual(
  isShortcutEventAllowed({
    key: "s",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    target: {
      isContentEditable: false,
      closest: () => null
    }
  }),
  false,
  "should block shortcuts when modifier keys are pressed"
);

assert.strictEqual(
  isShortcutEventAllowed({
    key: "s",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: {
      isContentEditable: false,
      closest: (selector) => (selector === "input, textarea, [contenteditable=\"true\"]" ? {} : null)
    }
  }),
  false,
  "should block shortcuts while typing in editable controls"
);

assert.strictEqual(
  formatShortcutToastMessage("delay", 500, "+1.0s"),
  "字幕延后 +0.5s，当前 +1.0s",
  "should format a delay shortcut toast with delta and current delay"
);

assert.strictEqual(
  formatShortcutToastMessage("toggle-visibility", null, null, true),
  "字幕已显示",
  "should format visibility toast when subtitles become visible"
);

assert.strictEqual(
  formatShortcutToastMessage("toggle-panel"),
  "已打开字幕面板",
  "should format panel toggle toast"
);

console.log("page-memory-history-shortcuts tests passed");
