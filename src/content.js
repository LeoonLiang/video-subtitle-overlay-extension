(() => {
  const STORAGE_KEY = "vso-settings";
  const DEFAULT_SETTINGS = {
    textColor: "#ffffff",
    backgroundColor: "#000000",
    backgroundOpacity: 0.55,
    fontSize: 28,
    delayMs: 0
  };
  const DELAY_STEP_MS = 500;

  const state = {
    videos: new Set(),
    activeVideo: null,
    cues: [],
    settings: { ...DEFAULT_SETTINGS },
    panelOpen: false,
    hoverLocked: false,
    siteEnabled: false
  };
  const helpers = globalThis.__VSO_HELPERS__ || {};
  const SITE_STORAGE_KEY = helpers.SITE_STORAGE_KEY || "vso-enabled-sites";
  const resolveUiRoot = typeof helpers.resolveUiRoot === "function"
    ? helpers.resolveUiRoot
    : (doc) => doc.documentElement;
  const isSiteEnabled = typeof helpers.isSiteEnabled === "function"
    ? helpers.isSiteEnabled
    : () => false;
  const getSubtitleFilenameFromUrl =
    typeof helpers.getSubtitleFilenameFromUrl === "function"
      ? helpers.getSubtitleFilenameFromUrl
      : () => "remote-subtitle.srt";
  const formatDelayLabel =
    typeof helpers.formatDelayLabel === "function"
      ? helpers.formatDelayLabel
      : (delayMs) => `${delayMs / 1000}s`;
  let currentUiRoot = null;

  const button = document.createElement("button");
  button.className = "vso-button vso-hidden";
  button.type = "button";
  button.textContent = "字幕";

  const panel = document.createElement("div");
  panel.className = "vso-panel vso-hidden";
  panel.innerHTML = `
    <div class="vso-panel-title">字幕设置</div>
    <div class="vso-grid">
      <div class="vso-field">
        <label for="vso-file-input">加载本地字幕</label>
        <input id="vso-file-input" class="vso-file" type="file" accept=".srt,.vtt,.ass,.ssa,.json,text/plain">
      </div>
      <div class="vso-field">
        <label for="vso-url-input">加载在线字幕</label>
        <div class="vso-source-row">
          <input id="vso-url-input" class="vso-text-input" type="url" placeholder="https://example.com/subtitle.srt">
          <button id="vso-url-load" class="vso-action vso-action-primary" type="button">加载链接</button>
        </div>
      </div>
      <div class="vso-color-row">
        <div class="vso-field">
          <label for="vso-text-color">字体颜色</label>
          <input id="vso-text-color" class="vso-color" type="color">
        </div>
        <div class="vso-field">
          <label for="vso-bg-color">背景颜色</label>
          <input id="vso-bg-color" class="vso-color" type="color">
        </div>
      </div>
      <div class="vso-field">
        <span>背景透明度</span>
        <div class="vso-range-row">
          <input id="vso-bg-opacity" class="vso-range" type="range" min="0" max="1" step="0.05">
          <span id="vso-bg-opacity-value" class="vso-range-value"></span>
        </div>
      </div>
      <div class="vso-field">
        <span>字体大小</span>
        <div class="vso-range-row">
          <input id="vso-font-size" class="vso-range" type="range" min="16" max="64" step="1">
          <span id="vso-font-size-value" class="vso-range-value"></span>
        </div>
      </div>
      <div class="vso-field">
        <span>字幕时序微调</span>
        <div class="vso-delay-row">
          <button id="vso-delay-earlier" class="vso-action vso-action-secondary" type="button">字幕提前 0.5s</button>
          <button id="vso-delay-later" class="vso-action vso-action-secondary" type="button">字幕延后 0.5s</button>
        </div>
        <div id="vso-delay-value" class="vso-delay-value">当前偏移：0.0s</div>
      </div>
      <div class="vso-action-row">
        <button id="vso-hide-subtitles" class="vso-action vso-action-secondary" type="button">隐藏字幕</button>
        <button id="vso-reset" class="vso-action vso-action-primary" type="button">恢复默认</button>
      </div>
    </div>
    <div id="vso-status" class="vso-status">未加载字幕</div>
  `;

  const subtitleLayer = document.createElement("div");
  subtitleLayer.className = "vso-subtitle-layer vso-hidden";
  const subtitleBox = document.createElement("div");
  subtitleBox.className = "vso-subtitle-box";
  subtitleLayer.appendChild(subtitleBox);

  function removeUi() {
    button.remove();
    panel.remove();
    subtitleLayer.remove();
    currentUiRoot = null;
  }

  function syncUiRoot() {
    if (!state.siteEnabled) {
      return;
    }
    const nextRoot = resolveUiRoot(document, state.activeVideo);
    if (!nextRoot || nextRoot === currentUiRoot) {
      return;
    }
    nextRoot.append(button, panel, subtitleLayer);
    currentUiRoot = nextRoot;
  }

  const ui = {
    fileInput: panel.querySelector("#vso-file-input"),
    urlInput: panel.querySelector("#vso-url-input"),
    urlLoadButton: panel.querySelector("#vso-url-load"),
    textColor: panel.querySelector("#vso-text-color"),
    bgColor: panel.querySelector("#vso-bg-color"),
    bgOpacity: panel.querySelector("#vso-bg-opacity"),
    bgOpacityValue: panel.querySelector("#vso-bg-opacity-value"),
    fontSize: panel.querySelector("#vso-font-size"),
    fontSizeValue: panel.querySelector("#vso-font-size-value"),
    delayEarlierButton: panel.querySelector("#vso-delay-earlier"),
    delayLaterButton: panel.querySelector("#vso-delay-later"),
    delayValue: panel.querySelector("#vso-delay-value"),
    hideButton: panel.querySelector("#vso-hide-subtitles"),
    resetButton: panel.querySelector("#vso-reset"),
    status: panel.querySelector("#vso-status")
  };

  const hasChromeStorage =
    typeof chrome !== "undefined" &&
    chrome.storage &&
    chrome.storage.local;

  function rgbaFromHex(hex, alpha) {
    const clean = hex.replace("#", "");
    const expanded = clean.length === 3
      ? clean.split("").map((char) => char + char).join("")
      : clean;
    const value = Number.parseInt(expanded, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function setStatus(message) {
    ui.status.textContent = message;
  }

  function saveSettings() {
    if (!hasChromeStorage) {
      return;
    }
    chrome.storage.local.set({ [STORAGE_KEY]: state.settings });
  }

  function updateSubtitleStyles() {
    subtitleBox.style.color = state.settings.textColor;
    subtitleBox.style.background = rgbaFromHex(
      state.settings.backgroundColor,
      state.settings.backgroundOpacity
    );
    subtitleBox.style.fontSize = `${state.settings.fontSize}px`;
  }

  function syncControls() {
    ui.textColor.value = state.settings.textColor;
    ui.bgColor.value = state.settings.backgroundColor;
    ui.bgOpacity.value = String(state.settings.backgroundOpacity);
    ui.bgOpacityValue.textContent = `${Math.round(
      state.settings.backgroundOpacity * 100
    )}%`;
    ui.fontSize.value = String(state.settings.fontSize);
    ui.fontSizeValue.textContent = `${state.settings.fontSize}px`;
    ui.delayValue.textContent = `当前偏移：${formatDelayLabel(state.settings.delayMs)}`;
    updateSubtitleStyles();
  }

  function loadSettings() {
    if (!hasChromeStorage) {
      syncControls();
      return;
    }
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime?.lastError) {
        syncControls();
        return;
      }
      state.settings = {
        ...DEFAULT_SETTINGS,
        ...(result[STORAGE_KEY] || {})
      };
      syncControls();
      renderSubtitle();
    });
  }

  function applySiteEnabled(enabled) {
    state.siteEnabled = enabled;

    if (!enabled) {
      state.panelOpen = false;
      button.classList.add("vso-hidden");
      panel.classList.add("vso-hidden");
      subtitleLayer.classList.add("vso-hidden");
      removeUi();
      return;
    }

    syncUiRoot();
    refreshActiveVideo();
    positionButton();
    renderSubtitle();
  }

  function loadSiteState() {
    if (!hasChromeStorage) {
      applySiteEnabled(false);
      return;
    }

    chrome.storage.local.get(SITE_STORAGE_KEY, (result) => {
      if (chrome.runtime?.lastError) {
        applySiteEnabled(false);
        return;
      }

      applySiteEnabled(
        isSiteEnabled(result[SITE_STORAGE_KEY] || {}, window.location.href)
      );
    });
  }

  function formatTime(seconds) {
    const safe = Math.max(0, seconds);
    const hours = Math.floor(safe / 3600)
      .toString()
      .padStart(2, "0");
    const minutes = Math.floor((safe % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const secs = Math.floor(safe % 60)
      .toString()
      .padStart(2, "0");
    const millis = Math.round((safe % 1) * 1000)
      .toString()
      .padStart(3, "0");
    return `${hours}:${minutes}:${secs}.${millis}`;
  }

  function parseTimestamp(input) {
    const normalized = input.trim().replace(",", ".");
    const parts = normalized.split(":");
    if (parts.length < 2 || parts.length > 3) {
      return Number.NaN;
    }
    const nums = parts.map((part) => Number.parseFloat(part));
    if (nums.some((value) => Number.isNaN(value))) {
      return Number.NaN;
    }
    if (nums.length === 2) {
      return nums[0] * 60 + nums[1];
    }
    return nums[0] * 3600 + nums[1] * 60 + nums[2];
  }

  function normalizeText(text) {
    return text
      .replace(/\r/g, "")
      .replace(/{\\an\d}/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\\N/g, "\n")
      .trim();
  }

  function parseSrt(content) {
    const blocks = content
      .replace(/\r/g, "")
      .trim()
      .split(/\n{2,}/);
    const cues = [];
    for (const block of blocks) {
      const lines = block.split("\n").filter(Boolean);
      if (lines.length < 2) {
        continue;
      }
      const timingLine = lines.find((line) => line.includes("-->"));
      if (!timingLine) {
        continue;
      }
      const [rawStart, rawEnd] = timingLine.split("-->").map((item) => item.trim());
      const start = parseTimestamp(rawStart);
      const end = parseTimestamp(rawEnd);
      if (Number.isNaN(start) || Number.isNaN(end)) {
        continue;
      }
      const textLines = lines.slice(lines.indexOf(timingLine) + 1);
      cues.push({
        start,
        end,
        text: normalizeText(textLines.join("\n"))
      });
    }
    return cues;
  }

  function parseVtt(content) {
    const cleaned = content.replace(/^WEBVTT[^\n]*\n+/i, "");
    return parseSrt(cleaned);
  }

  function parseAss(content) {
    const lines = content.replace(/\r/g, "").split("\n");
    const cues = [];
    for (const line of lines) {
      if (!line.startsWith("Dialogue:")) {
        continue;
      }
      const payload = line.slice("Dialogue:".length).trim();
      const parts = payload.split(",");
      if (parts.length < 10) {
        continue;
      }
      const start = parseTimestamp(parts[1]);
      const end = parseTimestamp(parts[2]);
      const text = normalizeText(parts.slice(9).join(","));
      if (Number.isNaN(start) || Number.isNaN(end) || !text) {
        continue;
      }
      cues.push({ start, end, text });
    }
    return cues;
  }

  function parseJson(content) {
    const data = JSON.parse(content);
    if (!Array.isArray(data)) {
      throw new Error("JSON 字幕必须是数组");
    }
    return data
      .map((item) => ({
        start: typeof item.start === "string" ? parseTimestamp(item.start) : Number(item.start),
        end: typeof item.end === "string" ? parseTimestamp(item.end) : Number(item.end),
        text: normalizeText(String(item.text || ""))
      }))
      .filter((item) => !Number.isNaN(item.start) && !Number.isNaN(item.end) && item.text);
  }

  function parseSubtitleFile(name, content) {
    const lowerName = name.toLowerCase();
    if (lowerName.endsWith(".srt")) {
      return parseSrt(content);
    }
    if (lowerName.endsWith(".vtt")) {
      return parseVtt(content);
    }
    if (lowerName.endsWith(".ass") || lowerName.endsWith(".ssa")) {
      return parseAss(content);
    }
    if (lowerName.endsWith(".json")) {
      return parseJson(content);
    }
    const trySrt = parseSrt(content);
    if (trySrt.length > 0) {
      return trySrt;
    }
    const tryVtt = parseVtt(content);
    if (tryVtt.length > 0) {
      return tryVtt;
    }
    throw new Error("暂不支持该字幕格式");
  }

  function getVisibleRect(video) {
    const rect = video.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 60) {
      return null;
    }
    const clippedWidth = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
    const clippedHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    if (clippedWidth <= 0 || clippedHeight <= 0) {
      return null;
    }
    return rect;
  }

  function pickBestVideo() {
    if (state.activeVideo && document.contains(state.activeVideo) && getVisibleRect(state.activeVideo)) {
      return state.activeVideo;
    }

    const candidates = Array.from(state.videos).filter((video) => document.contains(video));
    let best = null;
    let bestScore = -1;

    for (const video of candidates) {
      const rect = getVisibleRect(video);
      if (!rect) {
        continue;
      }
      const area = rect.width * rect.height;
      const playingBonus = !video.paused && !video.ended ? area * 0.35 : 0;
      const score = area + playingBonus;
      if (score > bestScore) {
        best = video;
        bestScore = score;
      }
    }

    return best;
  }

  function positionButton() {
    if (!state.siteEnabled) {
      return;
    }
    syncUiRoot();
    const video = state.activeVideo;
    const rect = video ? getVisibleRect(video) : null;
    if (!video || !rect) {
      button.classList.add("vso-hidden");
      if (!state.panelOpen) {
        panel.classList.add("vso-hidden");
      }
      subtitleLayer.classList.add("vso-hidden");
      return;
    }

    button.classList.remove("vso-hidden");
    button.style.top = `${Math.max(12, rect.top + 12)}px`;
    button.style.left = `${Math.max(12, rect.right - button.offsetWidth - 12)}px`;

    if (state.panelOpen) {
      const panelTop = Math.min(
        window.innerHeight - panel.offsetHeight - 12,
        Math.max(12, rect.top + 56)
      );
      const panelLeft = Math.min(
        window.innerWidth - panel.offsetWidth - 12,
        Math.max(12, rect.right - panel.offsetWidth)
      );
      panel.style.top = `${panelTop}px`;
      panel.style.left = `${panelLeft}px`;
      panel.classList.remove("vso-hidden");
    }

    subtitleLayer.style.left = `${Math.max(0, rect.left)}px`;
    subtitleLayer.style.top = `${Math.max(0, rect.top)}px`;
    subtitleLayer.style.width = `${Math.max(0, rect.width)}px`;
    subtitleLayer.style.height = `${Math.max(0, rect.height)}px`;
  }

  function findCurrentCue(time) {
    let left = 0;
    let right = state.cues.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const cue = state.cues[mid];
      if (time < cue.start) {
        right = mid - 1;
      } else if (time > cue.end) {
        left = mid + 1;
      } else {
        return cue;
      }
    }
    return null;
  }

  function renderSubtitle() {
    if (!state.siteEnabled) {
      subtitleBox.textContent = "";
      subtitleLayer.classList.add("vso-hidden");
      return;
    }
    const video = state.activeVideo;
    if (!video || state.cues.length === 0) {
      subtitleBox.textContent = "";
      subtitleLayer.classList.add("vso-hidden");
      return;
    }

    const rect = getVisibleRect(video);
    if (!rect) {
      subtitleBox.textContent = "";
      subtitleLayer.classList.add("vso-hidden");
      return;
    }

    const time = video.currentTime + state.settings.delayMs / 1000;
    const cue = findCurrentCue(time);
    subtitleBox.textContent = cue ? cue.text : "";
    subtitleLayer.classList.toggle("vso-hidden", !cue);
    positionButton();
  }

  function setActiveVideo(video) {
    if (!video || video === state.activeVideo) {
      return;
    }
    state.activeVideo = video;
    attachVideoListeners(video);
    syncUiRoot();
    positionButton();
    renderSubtitle();
  }

  function refreshActiveVideo() {
    const best = pickBestVideo();
    if (best) {
      setActiveVideo(best);
    } else {
      state.activeVideo = null;
      syncUiRoot();
      positionButton();
    }
  }

  function handleVideoHover(event) {
    const video = event.currentTarget;
    state.hoverLocked = true;
    setActiveVideo(video);
  }

  function handleVideoLeave() {
    state.hoverLocked = false;
    window.setTimeout(() => {
      if (!state.hoverLocked) {
        refreshActiveVideo();
      }
    }, 120);
  }

  function attachVideoListeners(video) {
    if (video.dataset.vsoBound === "1") {
      return;
    }
    video.dataset.vsoBound = "1";
    video.addEventListener("mouseenter", handleVideoHover);
    video.addEventListener("mouseleave", handleVideoLeave);
    video.addEventListener("timeupdate", renderSubtitle);
    video.addEventListener("seeked", renderSubtitle);
    video.addEventListener("play", () => setActiveVideo(video));
    video.addEventListener("pause", renderSubtitle);
  }

  function registerVideo(video) {
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }
    state.videos.add(video);
    attachVideoListeners(video);
  }

  function scanVideos(root = document) {
    if (root instanceof HTMLVideoElement) {
      registerVideo(root);
      return;
    }
    const videos = root.querySelectorAll ? root.querySelectorAll("video") : [];
    videos.forEach(registerVideo);
    refreshActiveVideo();
  }

  function togglePanel(forceOpen) {
    if (!state.siteEnabled) {
      return;
    }
    state.panelOpen = typeof forceOpen === "boolean" ? forceOpen : !state.panelOpen;
    panel.classList.toggle("vso-hidden", !state.panelOpen);
    if (state.panelOpen) {
      positionButton();
    }
  }

  async function loadSubtitleFile(file) {
    const content = await file.text();
    return loadSubtitleContent(
      file.name,
      content,
      (cueCount) => `已加载 ${file.name}，共 ${cueCount} 条字幕`
    );
  }

  function loadSubtitleContent(sourceName, content, buildSuccessMessage) {
    const cues = parseSubtitleFile(sourceName, content)
      .filter((cue) => cue.end >= cue.start)
      .sort((a, b) => a.start - b.start);

    if (cues.length === 0) {
      throw new Error("字幕文件解析后没有可用条目");
    }

    state.cues = cues;
    setStatus(buildSuccessMessage(cues.length));
    renderSubtitle();
    return cues;
  }

  function requestSubtitleDownload(url) {
    return new Promise((resolve, reject) => {
      if (!chrome.runtime?.sendMessage) {
        reject(new Error("后台下载不可用"));
        return;
      }

      chrome.runtime.sendMessage(
        {
          type: "vso-download-subtitle",
          url
        },
        (response) => {
          if (chrome.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message || "后台下载失败"));
            return;
          }

          if (!response?.ok) {
            reject(new Error(response?.error || "下载字幕失败"));
            return;
          }

          resolve(response.content);
        }
      );
    });
  }

  async function loadSubtitleUrl(url) {
    const trimmedUrl = String(url || "").trim();

    if (!trimmedUrl) {
      throw new Error("请输入字幕链接");
    }

    setStatus("正在下载字幕...");
    const content = await requestSubtitleDownload(trimmedUrl);
    const sourceName = getSubtitleFilenameFromUrl(trimmedUrl);

    return loadSubtitleContent(
      sourceName,
      content,
      (cueCount) => `已加载在线字幕 ${sourceName}，共 ${cueCount} 条字幕`
    );
  }

  function adjustDelay(deltaMs) {
    state.settings.delayMs += deltaMs;
    syncControls();
    saveSettings();
    setStatus(`当前字幕偏移 ${formatDelayLabel(state.settings.delayMs)}`);
    renderSubtitle();
  }

  function resetSettings() {
    state.settings = { ...DEFAULT_SETTINGS };
    syncControls();
    saveSettings();
    setStatus(`当前字幕偏移 ${formatDelayLabel(state.settings.delayMs)}`);
    renderSubtitle();
  }

  button.addEventListener("click", () => togglePanel());

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (panel.contains(target) || button.contains(target)) {
      return;
    }
    if (state.panelOpen) {
      togglePanel(false);
    }
  });

  ui.fileInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      await loadSubtitleFile(file);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "字幕文件加载失败");
    } finally {
      ui.fileInput.value = "";
    }
  });

  ui.urlLoadButton.addEventListener("click", async () => {
    ui.urlLoadButton.disabled = true;

    try {
      await loadSubtitleUrl(ui.urlInput.value);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "在线字幕加载失败");
    } finally {
      ui.urlLoadButton.disabled = false;
    }
  });

  ui.urlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      ui.urlLoadButton.click();
    }
  });

  ui.textColor.addEventListener("input", () => {
    state.settings.textColor = ui.textColor.value;
    updateSubtitleStyles();
    saveSettings();
  });

  ui.bgColor.addEventListener("input", () => {
    state.settings.backgroundColor = ui.bgColor.value;
    updateSubtitleStyles();
    saveSettings();
  });

  ui.bgOpacity.addEventListener("input", () => {
    state.settings.backgroundOpacity = Number.parseFloat(ui.bgOpacity.value);
    ui.bgOpacityValue.textContent = `${Math.round(state.settings.backgroundOpacity * 100)}%`;
    updateSubtitleStyles();
    saveSettings();
  });

  ui.fontSize.addEventListener("input", () => {
    state.settings.fontSize = Number.parseInt(ui.fontSize.value, 10);
    ui.fontSizeValue.textContent = `${state.settings.fontSize}px`;
    updateSubtitleStyles();
    saveSettings();
    renderSubtitle();
  });

  ui.delayEarlierButton.addEventListener("click", () => {
    adjustDelay(-DELAY_STEP_MS);
  });

  ui.delayLaterButton.addEventListener("click", () => {
    adjustDelay(DELAY_STEP_MS);
  });

  ui.hideButton.addEventListener("click", () => {
    state.cues = [];
    subtitleBox.textContent = "";
    subtitleLayer.classList.add("vso-hidden");
    setStatus("字幕已隐藏");
  });

  ui.resetButton.addEventListener("click", resetSettings);

  window.addEventListener("scroll", () => {
    positionButton();
    renderSubtitle();
  }, true);

  window.addEventListener("resize", () => {
    positionButton();
    renderSubtitle();
  });

  document.addEventListener("fullscreenchange", () => {
    syncUiRoot();
    positionButton();
    renderSubtitle();
  });

  document.addEventListener("webkitfullscreenchange", () => {
    syncUiRoot();
    positionButton();
    renderSubtitle();
  });

  if (chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "vso-site-status-changed") {
        applySiteEnabled(Boolean(message.enabled));
      }
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => scanVideos(node));
      mutation.removedNodes.forEach((node) => {
        if (node === state.activeVideo || (node instanceof Element && state.activeVideo && node.contains(state.activeVideo))) {
          state.activeVideo = null;
        }
      });
    }
    refreshActiveVideo();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  loadSettings();
  loadSiteState();
  scanVideos();
})();
