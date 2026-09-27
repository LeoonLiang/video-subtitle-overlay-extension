import assert from "assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../src/content-helpers.js";

const {
  findCueIndexAtTime,
  formatCueTimeLabel
} = globalThis.__VSO_HELPERS__ || {};

assert.ok(findCueIndexAtTime, "findCueIndexAtTime should be defined");
assert.ok(formatCueTimeLabel, "formatCueTimeLabel should be defined");

const contentSource = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/content.js"),
  "utf8"
);
const parserSource = contentSource.slice(
  contentSource.indexOf("function formatTime"),
  contentSource.indexOf("function getVisibleRect")
);
const parsers = new Function(
  `${parserSource}; return { parseSrt, parseVtt, parseAss };`
)();

// 一条短 cue 嵌在长 cue 里，真实字幕（双语同时间戳、整段+逐句）很常见。
const nestedCues = [
  { start: 0, end: 10, text: "long" },
  { start: 5, end: 6, text: "short" },
  { start: 20, end: 30, text: "later" }
];

assert.strictEqual(
  findCueIndexAtTime(nestedCues, 4),
  0,
  "should still find the containing cue before a nested cue starts"
);

assert.strictEqual(
  findCueIndexAtTime(nestedCues, 5.5),
  1,
  "should prefer the nested cue while it is active"
);

assert.strictEqual(
  findCueIndexAtTime(nestedCues, 7),
  0,
  "should not lose the long cue while a nested cue is still in progress"
);

assert.strictEqual(
  findCueIndexAtTime(nestedCues, 15),
  -1,
  "should return -1 in a real gap between cues"
);

// 字幕面板的线性扫描对重叠免疫，视频字幕走的是查找函数，
// 两者不一致正是「面板正常但画面上没字幕」的成因。
const overlappingCues = [];
let overlapTime = 1;
for (let index = 0; index < 2000 && overlapTime < 7200; index += 1) {
  const duration = 2.5;
  overlappingCues.push({
    start: Number(overlapTime.toFixed(3)),
    end: Number((overlapTime + duration).toFixed(3))
  });
  overlappingCues.push({
    start: Number(overlapTime.toFixed(3)),
    end: Number((overlapTime + duration - 0.4).toFixed(3))
  });
  overlapTime += duration + 0.4;
}
overlappingCues.sort((left, right) => left.start - right.start);

let missedOverlappingCues = 0;
for (let time = 0; time <= 7200; time += 0.25) {
  const hasCue = overlappingCues.some(
    (cue) => time >= cue.start && time <= cue.end
  );
  if (hasCue && findCueIndexAtTime(overlappingCues, time) === -1) {
    missedOverlappingCues += 1;
  }
}

assert.strictEqual(
  missedOverlappingCues,
  0,
  "should match a linear scan for a two hour subtitle with overlapping cues"
);

assert.strictEqual(
  formatCueTimeLabel(0),
  "00:00",
  "should keep the compact minute format below one hour"
);

assert.strictEqual(
  formatCueTimeLabel(300),
  "05:00",
  "should render five minutes as MM:SS"
);

assert.strictEqual(
  formatCueTimeLabel(3600),
  "1:00:00",
  "should include the hour once the subtitle passes one hour"
);

assert.strictEqual(
  formatCueTimeLabel(5400),
  "1:30:00",
  "should include the hour instead of showing a misleading 30:00"
);

assert.strictEqual(
  formatCueTimeLabel(45296),
  "12:34:56",
  "should keep multi hour labels readable"
);

const hourLabels = [0, 5, 300, 3599, 3600, 3630, 5400, 7200].map(formatCueTimeLabel);
assert.strictEqual(
  new Set(hourLabels).size,
  hourLabels.length,
  "should not collapse distinct timestamps into duplicate labels"
);

const cueWithSettings = [
  "WEBVTT",
  "",
  "00:00:01.000 --> 00:00:03.000 align:start line:0%",
  "with cue settings",
  "",
  "01:00:00.000 --> 01:00:04.000 align:start",
  "past one hour",
  ""
].join("\n");

assert.deepStrictEqual(
  parsers.parseVtt(cueWithSettings).map((cue) => cue.start),
  [1, 3600],
  "should keep cues whose timing line carries WebVTT cue settings"
);

const cueWithPosition = [
  "1",
  "00:00:01,000 --> 00:00:03,000 X1:1 X2:2 Y1:3 Y2:4",
  "positioned cue"
].join("\n") + "\n\n" + [
  "2",
  "01:00:00,000 --> 01:00:04,000 X1:1 X2:2 Y1:3 Y2:4",
  "positioned cue past one hour"
].join("\n");

assert.deepStrictEqual(
  parsers.parseSrt(cueWithPosition).map((cue) => cue.start),
  [1, 3600],
  "should keep cues whose timing line carries SRT position tags"
);

assert.deepStrictEqual(
  parsers
    .parseAss("Dialogue: 0,1:00:00.00,1:00:04.00,Default,,0,0,0,,past one hour")
    .map((cue) => cue.start),
  [3600],
  "should keep ASS timestamps past one hour"
);

assert.deepStrictEqual(
  parsers
    .parseSrt("1\n00:00:01,000 --> 00:00:03,000\n\n")
    .map((cue) => cue.start),
  [],
  "should drop cues without text so they cannot blank the overlay"
);

assert.deepStrictEqual(
  parsers.parseSrt("1\n00:00:01,000 --> 00:00:03,000\n♪").map((cue) => cue.text),
  ["♪"],
  "should keep cues that only contain a music note"
);

const standardCue = [
  "1\n00:00:01,000 --> 00:00:03,000\nfirst",
  "2\n00:59:50,000 --> 00:59:58,000\nbefore one hour",
  "3\n01:00:00,000 --> 01:00:04,000\nat one hour",
  "4\n02:15:30,000 --> 02:15:36,000\npast two hours"
].join("\n\n");

assert.deepStrictEqual(
  parsers.parseSrt(standardCue).map((cue) => cue.start),
  [1, 3590, 3600, 8130],
  "should keep parsing standard subtitle timestamps past one hour"
);

assert.strictEqual(
  parsers
    .parseSrt("1\n00:00:01,000 --> 00:00:03.500\nperiod\n\n2\n01:00:00.000 --> 01:00:02.000\nhour")
    .length,
  2,
  "should keep supporting period separated timestamps"
);

console.log("long-subtitle tests passed");
