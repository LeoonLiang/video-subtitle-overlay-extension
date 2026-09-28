import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(process.env.VSO_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.VSO_PLAYWRIGHT_MODULE).href : "playwright-core");
const profile = await mkdtemp(join(tmpdir(), "vso-optimizations-"));
const extension = fileURLToPath(new URL("../src", import.meta.url));
// A seekable local media file exercises the real native playback clock, shared
// by page and extension isolated worlds. Page-side property mocks are not.
const media = Buffer.alloc(44 + 8000 * 2 * 300);
media.write("RIFF", 0); media.writeUInt32LE(media.length - 8, 4); media.write("WAVEfmt ", 8);
media.writeUInt32LE(16, 16); media.writeUInt16LE(1, 20); media.writeUInt16LE(1, 22);
media.writeUInt32LE(8000, 24); media.writeUInt32LE(16000, 28); media.writeUInt16LE(2, 32); media.writeUInt16LE(16, 34);
media.write("data", 36); media.writeUInt32LE(media.length - 44, 40);
let releaseDownload;
let notifyDownload;
const downloadStarted = new Promise((resolve) => { notifyDownload = resolve; });
const downloadGate = new Promise((resolve) => { releaseDownload = resolve; });
let downloadCount = 0;
const server = http.createServer((req, res) => {
  if (req.url === "/updated.srt") {
    res.setHeader("Content-Type", "text/plain");
    res.end("1\n00:00:00,000 --> 00:05:00,000\nUpdated remote\n");
    return;
  }
  if (req.url === "/slow.srt") {
    downloadCount += 1;
    notifyDownload();
    res.setHeader("Content-Type", "text/plain");
    const send = () => res.end("1\n00:00:00,000 --> 00:05:00,000\nRestored remote\n");
    if (downloadCount === 1) void downloadGate.then(send);
    else send();
    return;
  }
  if (req.url === "/media.wav") {
    const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1;
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Accept-Ranges", "bytes");
    if (range) { res.statusCode = 206; res.setHeader("Content-Range", `bytes ${start}-${end}/${media.length}`); }
    res.setHeader("Content-Length", end - start + 1);
    return res.end(media.subarray(start, end + 1));
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><style>body{margin:0}video{width:800px;height:450px;background:#182030}</style>
    <video src="/media.wav" preload="auto"></video><p>Local subtitle test</p>`);
});
let context;
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.VSO_CHROMIUM_EXECUTABLE, headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const site = (enabled) => worker.evaluate((value) => chrome.storage.local.set({ "vso-enabled-sites": value ? { "127.0.0.1": true } : {} }), enabled);
  const page = await context.newPage();
  await page.goto(url);
  // Allow document_idle initialization; this checks the absence of work.
  await page.waitForTimeout(400);
  assert.equal(await page.locator("video[data-vso-bound]").count(), 0, "disabled site must not bind video listeners");
  await site(true);
  await page.locator(".vso-button").waitFor({ state: "visible" });
  await site(false);
  await page.locator(".vso-button").waitFor({ state: "detached" });
  assert.equal(await page.locator("video[data-vso-bound]").count(), 0, "disable must release video listeners");
  await page.evaluate(() => document.body.append(document.createElement("video")));
  await page.waitForTimeout(100);
  assert.equal(await page.locator("video[data-vso-bound]").count(), 0, "disabled observer must not discover new videos");
  await site(true);
  await page.locator(".vso-button").waitFor({ state: "visible" });
  assert.equal(await page.locator(".vso-button").count(), 1);
  await page.locator("video").last().evaluate((video) => { window.savedVideo = video; video.remove(); });
  await page.waitForTimeout(100);
  await site(false);
  await page.locator(".vso-button").waitFor({ state: "detached" });
  await page.evaluate(() => document.body.append(window.savedVideo));
  await site(true);
  await page.locator(".vso-button").waitFor({ state: "visible" });
  // Dispatch play on the reinserted element: successful rebinding must move UI.
  await page.locator("video").last().evaluate((video) => video.dispatchEvent(new Event("play")));
  const rebinding = await page.locator(".vso-button").evaluate((button) => ({ top: button.getBoundingClientRect().top, videoTop: document.querySelectorAll("video")[1].getBoundingClientRect().top }));
  assert.ok(Math.abs(rebinding.top - rebinding.videoTop - 12) < 2, "reinserted video must regain playback listeners after disable/enable");
  await page.locator("video").last().evaluate((video) => { video.remove(); delete window.savedVideo; });
  console.log("lazy startup, disable cleanup and reactivation passed");

  await page.locator(".vso-button").click();
  await page.locator("#vso-file-toggle").click();
  const cues = Array.from({ length: 10000 }, (_, index) => ({ start: index * 5, end: index * 5 + 4, text: `Line ${index} with full text` }));
  await page.locator("#vso-file-input").setInputFiles({ name: "long.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(cues)) });
  await page.waitForFunction(() => document.querySelector("#vso-current-subtitle-name")?.textContent === "long.json");
  assert.equal(await page.locator(".vso-preview-item").count(), 0, "hidden preview must not create 10000 rows");
  await page.locator("#vso-tab-preview").click();
  await page.locator(".vso-preview-item").first().waitFor();
  assert.ok(await page.locator(".vso-preview-item").count() < 40, "visible list must bound row count");
  await page.locator("#vso-preview-list").evaluate((list) => { list.dispatchEvent(new WheelEvent("wheel")); list.scrollTop = list.scrollHeight; list.dispatchEvent(new Event("scroll")); });
  await page.locator('[data-cue-index="9999"]').waitFor();
  assert.ok(await page.locator(".vso-preview-item").count() < 40);
  await page.locator("#vso-tab-load").click();
  const mutations = await page.evaluate(async () => {
    let count = 0;
    const observer = new MutationObserver((records) => { count += records.length; });
    observer.observe(document.querySelector("#vso-preview-list"), { subtree: true, childList: true, attributes: true, characterData: true });
    const video = document.querySelector("video");
    for (let index = 0; index < 10; index++) video.dispatchEvent(new Event("timeupdate"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    observer.disconnect();
    return count;
  });
  assert.equal(mutations, 0, "hidden preview must not update row DOM during playback");
  console.log("10000-cue lazy virtual list, last row scrolling and hidden rendering passed");

  const setTimeOn = async (target, seconds) => target.evaluate((value) => new Promise((resolve) => {
    const video = document.querySelector("video");
    if (Math.abs(video.currentTime - value) < 0.001) return resolve();
    video.addEventListener("seeked", resolve, { once: true });
    video.currentTime = value;
  }), seconds);
  const setTime = (seconds) => setTimeOn(page, seconds);
  await setTime(8);
  await page.locator("#vso-tab-preview").click();
  await page.locator("#vso-preview-resume").click();
  await page.locator('[data-cue-index="2"]').click();
  assert.equal(await page.locator("video").first().evaluate((video) => video.currentTime), 8, "selecting a line must not seek before calibration");
  await page.locator("#vso-calibrate-now").click();
  assert.equal(await page.locator(".vso-subtitle-box").textContent(), "Line 2 with full text");
  await page.locator("#vso-calibrate-first").click();
  await setTime(16);
  await page.locator('[data-cue-index="4"]').click();
  await page.locator("#vso-calibrate-second").click();
  await setTime(20);
  assert.equal(await page.locator(".vso-subtitle-box").textContent(), "Line 5 with full text", "two-point correction must alter subtitle speed");
  await page.locator("#vso-cue-seek").click();
  assert.equal(await page.locator("video").first().evaluate((video) => video.currentTime), 16, "seek uses inverse calibrated clock");
  await page.locator("#vso-calibrate-reset").click();
  assert.equal(await page.locator(".vso-subtitle-box").textContent(), "Line 3 with full text");
  console.log("one-point calibration, two-point drift, inverse seek and reset passed");
  await setTime(8);
  await page.locator('[data-cue-index="2"]').click();
  await page.locator("#vso-calibrate-now").click();
  await page.locator("#vso-tab-load").click();
  await page.locator("#vso-clear-subtitle").click();
  await page.locator("#vso-file-input").setInputFiles({ name: "replacement.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(cues.slice(0, 10))) });
  await page.waitForFunction(() => document.querySelector("#vso-current-subtitle-name")?.textContent === "replacement.json");
  assert.equal(await page.locator(".vso-subtitle-box").textContent(), "Line 1 with full text", "clearing subtitle A must not pass its calibration to B");
  console.log("replacement subtitle calibration isolation passed");

  await worker.evaluate((base) => chrome.storage.local.set({
    "vso-settings": { keepRecords: true },
    "vso-page-memory": { [`${base}/restore`]: { delayMs: 0, timingRate: 1, subtitleSource: { kind: "remote", label: "slow.srt", url: `${base}/slow.srt` } } }
  }), url);
  const restorePage = await context.newPage();
  await restorePage.goto(`${url}/restore`);
  await downloadStarted;
  await site(false);
  await restorePage.locator(".vso-button").waitFor({ state: "detached" });
  await worker.evaluate((base) => chrome.storage.local.set({
    "vso-page-memory": { [`${base}/restore`]: { delayMs: 0, timingRate: 1, subtitleSource: { kind: "remote", label: "updated.srt", url: `${base}/updated.srt` } } }
  }), url);
  releaseDownload();
  await site(true);
  await restorePage.locator(".vso-button").waitFor({ state: "visible" });
  await restorePage.waitForFunction(() => document.querySelector(".vso-subtitle-box")?.textContent === "Updated remote", null, { timeout: 7000 });
  console.log("interrupted auto-restore retries from fresh memory after reactivation passed");

  await page.locator(".vso-button").click();
  await page.locator("#vso-tab-settings").click();
  await restorePage.locator(".vso-button").click();
  await restorePage.locator("#vso-tab-settings").click();
  const changeInput = (target, id, value) => target.locator(id).evaluate((input, next) => {
    input.value = next; input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  await Promise.all([
    changeInput(page, "#vso-text-color", "#ffee00"),
    changeInput(restorePage, "#vso-font-size", "28")
  ]);
  for (const target of [page, restorePage]) {
    await target.waitForFunction(() => document.querySelector("#vso-text-color")?.value === "#ffee00" && document.querySelector("#vso-font-size")?.value === "28");
  }
  await page.evaluate((base) => {
    const frame = document.createElement("iframe"); frame.name = "settings-frame";
    frame.style = "width:800px;height:450px"; frame.src = `${base}/embedded`; document.body.append(frame);
  }, url);
  await page.waitForEvent("framenavigated", { predicate: (frame) => frame.name() === "settings-frame" });
  const embedded = page.frame({ name: "settings-frame" });
  await embedded.locator(".vso-button").waitFor({ state: "visible" });
  await changeInput(restorePage, "#vso-font-size", "32");
  await embedded.waitForFunction(() => document.querySelector("#vso-font-size")?.value === "32");
  console.log("concurrent appearance patches and cross-tab/iframe synchronization passed");

  const loadLocal = async (target, name) => {
    await target.locator("#vso-tab-load").click();
    if (await target.locator("#vso-file-toggle").getAttribute("aria-expanded") !== "true") await target.locator("#vso-file-toggle").click();
    await target.locator("#vso-file-input").setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(cues.slice(0, 10))) });
    await target.waitForFunction((label) => document.querySelector("#vso-current-subtitle-name")?.textContent === label, name);
  };
  await Promise.all([loadLocal(page, "tab-A.json"), loadLocal(restorePage, "tab-B.json")]);
  for (const target of [page, restorePage]) {
    await target.locator("#vso-tab-library").click();
    await target.waitForFunction(() => {
      const history = document.querySelector("#vso-history-list")?.textContent;
      return history?.includes("tab-A.json") && history?.includes("tab-B.json");
    });
  }
  await Promise.all([
    page.locator("#vso-history-list .vso-library-item").filter({ hasText: "tab-A.json" }).locator('[data-action="favorite"]').click(),
    restorePage.locator("#vso-history-list .vso-library-item").filter({ hasText: "tab-B.json" }).locator('[data-action="favorite"]').click()
  ]);
  await embedded.waitForFunction(() => {
    const favorites = document.querySelector("#vso-favorites-list")?.textContent;
    return favorites?.includes("tab-A.json") && favorites?.includes("tab-B.json");
  });
  console.log("concurrent history and favorite additions survive and synchronize passed");

  await page.locator("#vso-tab-preview").click();
  await setTime(8);
  await page.locator('[data-cue-index="2"]').click();
  await page.locator("#vso-calibrate-first").click();
  await setTime(16);
  await page.locator('[data-cue-index="4"]').click();
  await page.locator("#vso-calibrate-second").click();
  assert.match(await restorePage.locator("#vso-calibration-status").textContent(), /时间比例 1\.00000/, "calibration must not alter another player's clock");
  await worker.evaluate(async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const data = await chrome.storage.local.get("vso-page-memory");
      if (Object.values(data["vso-page-memory"] || {}).some((record) => record.subtitleSource?.label === "tab-A.json" && record.timingRate === 1.25)) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("calibration was not persisted");
  });
  if (process.env.VSO_SCREENSHOT) await page.screenshot({ path: process.env.VSO_SCREENSHOT });
  const reopened = await context.newPage();
  await reopened.goto(page.url());
  await reopened.locator(".vso-button").waitFor({ state: "visible" });
  await reopened.waitForFunction(() => document.querySelector("#vso-calibration-status")?.textContent.includes("1.25000"));
  await reopened.locator(".vso-button").click();
  await loadLocal(reopened, "tab-A.json");
  await setTimeOn(reopened, 8);
  assert.equal(await reopened.locator(".vso-subtitle-box").textContent(), "Line 2 with full text", "same local subtitle restores its saved timing");
  await reopened.locator("#vso-tab-library").click();
  await reopened.locator("#vso-history-list .vso-library-item").filter({ hasText: "tab-B.json" }).locator('[data-action="load"]').click();
  assert.equal(await reopened.locator("#vso-current-subtitle-name").textContent(), "tab-A.json", "a local library reminder must not relabel the loaded subtitle");
  await loadLocal(reopened, "tab-B.json");
  assert.equal(await reopened.locator(".vso-subtitle-box").textContent(), "Line 1 with full text", "choosing a different local file resets saved calibration");
  await reopened.close();
  console.log("calibration remains player-local, persists, restores and resets for a new source passed");

  await page.locator("#vso-tab-settings").click();
  await page.locator("#vso-keep-records").check();
  for (const target of [restorePage, embedded]) {
    await target.waitForFunction(() => document.querySelector("#vso-keep-records")?.checked === true
      && document.querySelector("#vso-history-list")?.childElementCount === 0
      && document.querySelector("#vso-favorites-list")?.childElementCount === 0);
  }
  await loadLocal(restorePage, "private.json");
  await restorePage.waitForFunction(() => document.querySelector(".vso-subtitle-box")?.textContent === "Line 0 with full text");
  const stored = await worker.evaluate(() => chrome.storage.local.get(["vso-page-memory", "vso-subtitle-history"]));
  assert.deepEqual(stored["vso-page-memory"], {});
  assert.deepEqual(stored["vso-subtitle-history"], []);
  console.log("privacy sync clears all clients and suppresses later record writes passed");
} finally {
  releaseDownload();
  if (context) await context.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
