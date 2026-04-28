import assert from "assert";
import "../src/content-helpers.js";

const {
  findCueIndexAtTime,
  getPreviewTime,
  getPreviewViewState,
  getSeekTimeForCue
} = globalThis.__VSO_HELPERS__ || {};

assert.ok(findCueIndexAtTime, "findCueIndexAtTime should be defined");
assert.ok(getPreviewTime, "getPreviewTime should be defined");
assert.ok(getPreviewViewState, "getPreviewViewState should be defined");
assert.ok(getSeekTimeForCue, "getSeekTimeForCue should be defined");

const cues = [
  { start: 0, end: 1, text: "one" },
  { start: 2, end: 3.5, text: "two" },
  { start: 5, end: 7, text: "three" }
];

assert.strictEqual(
  findCueIndexAtTime(cues, 0.5),
  0,
  "should find the first cue when time falls inside it"
);

assert.strictEqual(
  findCueIndexAtTime(cues, 2.2),
  1,
  "should find the matching later cue"
);

assert.strictEqual(
  findCueIndexAtTime(cues, 4),
  -1,
  "should return -1 between cues"
);

assert.strictEqual(
  getPreviewTime(10, 500),
  10.5,
  "should apply positive delay to preview time"
);

assert.strictEqual(
  getPreviewTime(10, -500),
  9.5,
  "should apply negative delay to preview time"
);

assert.strictEqual(
  getSeekTimeForCue(12, 500),
  11.5,
  "should subtract positive delay so the clicked cue lands on the effective subtitle time"
);

assert.strictEqual(
  getSeekTimeForCue(12, -500),
  12.5,
  "should add back negative delay when subtitles are advanced"
);

assert.strictEqual(
  getSeekTimeForCue(0.2, 500),
  0,
  "should clamp seek time to zero"
);

assert.deepStrictEqual(
  getPreviewViewState({
    cues: [],
    activeCueIndex: -1,
    autoFollow: true
  }),
  {
    mode: "empty",
    activeCueIndex: -1,
    showResumeButton: false
  },
  "should show empty mode when no cues are loaded"
);

assert.deepStrictEqual(
  getPreviewViewState({
    cues,
    activeCueIndex: 1,
    autoFollow: false
  }),
  {
    mode: "list",
    activeCueIndex: 1,
    showResumeButton: true
  },
  "should keep list mode and show resume button when follow is paused"
);

console.log("subtitle-preview tests passed");
