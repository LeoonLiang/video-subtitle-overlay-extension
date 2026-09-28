// Optional browser integration suite. Install playwright-core outside the
// extension, then provide VSO_PLAYWRIGHT_MODULE and VSO_CHROMIUM_EXECUTABLE.
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(process.env.VSO_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.VSO_PLAYWRIGHT_MODULE).href : "playwright-core");
const extensionPath = fileURLToPath(new URL("../src", import.meta.url));
const profilePath = await mkdtemp(join(tmpdir(), "vso-iframe-browser-"));
const player = `<!doctype html><html><head><style>
  html,body{margin:0;width:100%;height:100%;background:#1d2534}
  #player,video{width:100%;height:100%}video{display:block}
  </style></head><body><div id="player"><video muted autoplay></video></div>
  <script>
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
  const ctx=canvas.getContext('2d');
  setInterval(()=>{ctx.fillStyle='#1d2534';ctx.fillRect(0,0,640,360);},50);
  document.querySelector('video').srcObject=canvas.captureStream(20);
  </script></body></html>`;
let port;
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.url.startsWith("/player")) return res.end(player);
  if (req.url === "/nested") {
    return res.end(`<iframe name="nested-player" style="width:600px;height:340px" allowfullscreen src="http://localhost:${port}/player?nested"></iframe>`);
  }
  res.end(`<!doctype html><html><body>
    <iframe name="same" style="width:620px;height:360px" allowfullscreen src="/player?same"></iframe>
    <iframe name="cross" style="width:620px;height:260px" allowfullscreen src="http://localhost:${port}/player?cross"></iframe>
    <iframe name="nested" style="width:640px;height:380px" src="/nested"></iframe>
    <iframe name="srcdoc" style="width:620px;height:360px" srcdoc="${player.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></iframe>
    </body></html>`);
});

let context;
try {
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  port = server.address().port;
  context = await chromium.launchPersistentContext(profilePath, {
    executablePath: process.env.VSO_CHROMIUM_EXECUTABLE,
    headless: true,
    viewport: { width: 1400, height: 1000 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  const errors = [];
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const setSites = (sites) => worker.evaluate((value) => chrome.storage.local.set({ "vso-enabled-sites": value }), sites);
  await setSites({ "127.0.0.1": true });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  const requireButton = async (frame) => {
    assert.ok(frame, "fixture frame must exist");
    await frame.locator(".vso-button").waitFor({ state: "visible", timeout: 7000 });
  };
  for (const name of ["same", "cross", "nested-player", "srcdoc"]) {
    await requireButton(page.frame({ name }));
  }
  assert.equal(await page.locator(".vso-button:visible").count(), 0, "outer page without video has no duplicate button");
  console.log("same-origin, cross-origin, nested and srcdoc injection passed");

  await page.evaluate((html) => {
    const blank = document.createElement("iframe");
    blank.name = "blank";
    blank.style = "width:620px;height:360px";
    document.body.append(blank);
    blank.contentDocument.open(); blank.contentDocument.write(html); blank.contentDocument.close();
    const blob = document.createElement("iframe");
    blob.name = "blob"; blob.style = blank.style.cssText;
    blob.src = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    document.body.append(blob);
    const late = document.createElement("iframe");
    late.name = "late"; late.style = blank.style.cssText;
    late.src = "/player?late"; document.body.append(late);
  }, player);
  for (const name of ["blank", "blob", "late"]) {
    await page.waitForEvent("framenavigated", { predicate: (frame) => frame.name() === name, timeout: 1000 }).catch(() => {});
    await requireButton(page.frame({ name }));
  }
  console.log("late, about:blank and blob frame injection passed");

  const cross = page.frame({ name: "cross" });
  await cross.locator(".vso-button").click();
  await cross.locator("#vso-file-toggle").click();
  const bounds = await cross.locator(".vso-panel").evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: innerHeight, scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight };
  });
  assert.ok(bounds.top >= 11 && bounds.bottom <= bounds.height - 11,
    `panel must fit inside short iframe: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.scrollHeight > bounds.clientHeight, "short panel should scroll to all controls");
  const switchTime = Math.ceil(await cross.locator("video").evaluate((video) => video.currentTime)) + 2;
  const timestamp = `${String(Math.floor(switchTime / 3600)).padStart(2, "0")}:${String(Math.floor(switchTime / 60) % 60).padStart(2, "0")}:${String(switchTime % 60).padStart(2, "0")},000`;
  await cross.locator("#vso-file-input").setInputFiles({
    name: "iframe.srt", mimeType: "application/x-subrip",
    buffer: Buffer.from(`1\n00:00:00,000 --> ${timestamp}\nFirst cue\n\n2\n${timestamp} --> 10:00:00,000\nInside iframe\n`)
  });
  await cross.waitForFunction(() => document.querySelector(".vso-subtitle-box")?.textContent === "First cue");
  await cross.waitForFunction(() => document.querySelector(".vso-subtitle-box")?.textContent === "Inside iframe");
  await cross.locator(".vso-subtitle-layer").waitFor({ state: "visible" });
  console.log("short-frame panel, subtitle load and playback clock passed");

  await cross.evaluate(() => document.querySelector("#player").requestFullscreen());
  await cross.waitForFunction(() => document.fullscreenElement?.contains(document.querySelector(".vso-subtitle-layer")));
  await cross.locator(".vso-subtitle-layer").waitFor({ state: "visible" });
  await cross.evaluate(() => document.exitFullscreen());
  await cross.waitForFunction(() => !document.fullscreenElement);
  console.log("iframe player container fullscreen passed");

  await setSites({ localhost: true });
  for (const frame of page.frames()) {
    await frame.locator(".vso-button").waitFor({ state: "detached" });
  }
  await page.reload();
  await page.waitForTimeout(400);
  assert.equal(await page.frame({ name: "cross" }).locator("video[data-vso-bound]").count(), 0,
    "disabled iframe must not attach playback listeners");
  assert.equal(await page.frame({ name: "cross" }).locator(".vso-button").count(), 0,
    "enabling only the player host must not opt in the outer page");
  await setSites({ "127.0.0.1": true });
  await requireButton(page.frame({ name: "cross" }));
  await page.reload();
  await requireButton(page.frame({ name: "cross" }));
  const topPlayer = await context.newPage();
  await topPlayer.goto(`http://127.0.0.1:${port}/player?top`);
  await requireButton(topPlayer.mainFrame());
  await topPlayer.locator(".vso-button").click();
  await topPlayer.locator(".vso-panel").waitFor({ state: "visible" });
  await worker.evaluate(() => chrome.storage.local.set({ "vso-settings": { keepRecords: true } }));
  await page.reload();
  const recordedFrame = page.frame({ name: "srcdoc" });
  await requireButton(recordedFrame);
  await recordedFrame.locator(".vso-button").click();
  await recordedFrame.locator("#vso-file-toggle").click();
  await recordedFrame.locator("#vso-file-input").setInputFiles({
    name: "page-one.srt", mimeType: "application/x-subrip",
    buffer: Buffer.from("1\n00:00:00,000 --> 10:00:00,000\nPage one\n")
  });
  await recordedFrame.waitForFunction(() => document.querySelector("#vso-current-subtitle-name")?.textContent === "page-one.srt");
  // Await the actual persistent write before navigating to a different page.
  await worker.evaluate(async () => {
    for (let attempts = 0; attempts < 100; attempts++) {
      const stored = await chrome.storage.local.get("vso-page-memory");
      if (Object.values(stored["vso-page-memory"] || {}).some((record) => record.subtitleSource?.label === "page-one.srt")) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("subtitle page memory was not saved");
  });
  await setSites({ "127.0.0.1": true, localhost: true });
  const unrelatedPage = await context.newPage();
  await unrelatedPage.goto(`http://localhost:${port}/different-page`);
  const unrelatedFrame = unrelatedPage.frame({ name: "srcdoc" });
  await requireButton(unrelatedFrame);
  await unrelatedFrame.locator(".vso-button").click();
  assert.equal(await unrelatedFrame.locator("#vso-current-subtitle-name").textContent(), "未加载字幕",
    "blank-frame memory must not leak to another outer page");
  await page.reload();
  await requireButton(page.frame({ name: "srcdoc" }));
  await page.frame({ name: "srcdoc" }).waitForFunction(() => document.querySelector("#vso-current-subtitle-name")?.textContent === "page-one.srt");
  console.log("srcdoc page memory isolation and same-page restoration passed");
  assert.deepEqual(errors, [], "content scripts must not throw page errors");
  console.log("disable, enable, outer-site isolation, reload and top-level player passed");
} finally {
  if (context) await context.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(profilePath, { recursive: true, force: true });
}
