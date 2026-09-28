import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({});
const source = new URL("../src/timing.js", import.meta.url);
if (fs.existsSync(source)) vm.runInContext(fs.readFileSync(source, "utf8"), context);
const timing = context.__VSO_TIMING__;
assert.ok(timing, "calibration must provide the shared subtitle clock");
const one = timing.calibrateOne(12, 10, 1);
assert.equal(one.delayMs, 2000);
assert.equal(timing.subtitleTime(10, one), 12);
assert.equal(timing.videoTime(12, one), 10);
const two = timing.calibrateTwo({ cue: 12, video: 10 }, { cue: 124, video: 110 });
assert.equal(two.rate, 1.12);
assert.ok(Math.abs(two.delayMs - 800) < 1e-8);
assert.ok(Math.abs(timing.subtitleTime(110, two) - 124) < 1e-8);
assert.ok(Math.abs(timing.videoTime(124, two) - 110) < 1e-8);
const shifted = timing.calibrateOne(236, 200, two.rate);
assert.equal(shifted.rate, 1.12, "one-point adjustment preserves established drift correction");
assert.equal(timing.subtitleTime(200, shifted), 236);
assert.equal(timing.videoTime(1, one), 0, "seeks before zero clamp to video start");
for (const second of [{ cue: 20, video: 10 }, { cue: 12, video: 20 }, { cue: 1, video: 20 }, { cue: 20, video: NaN }]) {
  assert.throws(() => timing.calibrateTwo({ cue: 12, video: 10 }, second));
}
assert.throws(() => timing.calibrateOne(Infinity, 10, 1));
assert.throws(() => timing.calibrateOne(12, -1, 1));
assert.equal(timing.subtitleTime(10, { rate: 0, delayMs: NaN }), 10, "invalid saved clock falls back safely");
console.log("timing tests passed");
