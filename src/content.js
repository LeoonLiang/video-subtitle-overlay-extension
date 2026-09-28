(() => {
  let controller = null;
  globalThis.__VSO_SITE_STATE__?.startSiteStateSync(globalThis.chrome, (enabled, pageUrl) => {
    if (!controller && enabled) controller = createController(pageUrl);
    if (controller) controller.setEnabled(enabled, pageUrl);
  });

  function createController(initialPageUrl) {
  const activeListeners = [];
  const boundVideos = new Map();
  let activeAbort = null;
  let activationGeneration = 0;
  let subtitleLoadRevision = 0;
  let restoreInProgress = false;
  function listenActive(target, type, listener, options = false) {
    activeListeners.push({ target, type, listener, options });
  }
  const STORAGE_KEY = "vso-settings";
  const PAGE_MEMORY_STORAGE_KEY = "vso-page-memory";
  const HISTORY_STORAGE_KEY = "vso-subtitle-history";
  const FAVORITES_STORAGE_KEY = "vso-subtitle-favorites";
  const DEFAULT_SETTINGS = {
    textColor: "#ffffff",
    backgroundColor: "#000000",
    backgroundOpacity: 0.55,
    fontSize: 16,
    delayMs: 0,
    keepRecords: false
  };
  const DELAY_STEP_MS = 500;

  const state = {
    videos: new Set(),
    activeVideo: null,
    cues: [],
    settings: { ...DEFAULT_SETTINGS },
    panelOpen: false,
    panelTab: "load",
    expandedLoadSection: "",
    hoverLocked: false,
    siteEnabled: false,
    sitePageUrl: initialPageUrl,
    activeCueIndex: -1,
    previewAutoFollow: true,
    selectedCueIndex: -1,
    previewIgnoreScroll: false,
    previewIgnoreTimer: 0,
    previewScrollIndex: -1,
    searchKeyword: "",
    searchResults: [],
    expandedResultUrl: "",
    searchLoading: false,
    searchError: "",
    languageOptionsByUrl: {},
    languageErrorByUrl: {},
    languageLoadingUrl: "",
    downloadingLanguageUrl: "",
    subtitleVisible: true,
    currentSubtitleSource: null,
    pageMemory: {},
    history: [],
    favorites: [],
    settingsLoaded: false,
    siteStateLoaded: false,
    libraryLoaded: false,
    pageMemoryRestored: false,
    timingRate: 1,
    calibrationAnchor: null
  };
  const helpers = globalThis.__VSO_HELPERS__ || {};
  const resolveUiRoot = typeof helpers.resolveUiRoot === "function"
    ? helpers.resolveUiRoot
    : (doc) => doc.documentElement;
  const getSubtitleFilenameFromUrl =
    typeof helpers.getSubtitleFilenameFromUrl === "function"
      ? helpers.getSubtitleFilenameFromUrl
      : () => "remote-subtitle.srt";
  const formatDelayLabel =
    typeof helpers.formatDelayLabel === "function"
      ? helpers.formatDelayLabel
      : (delayMs) => `${delayMs / 1000}s`;
  const timing = globalThis.__VSO_TIMING__;
  const currentTiming = () => ({ rate: state.timingRate, delayMs: state.settings.delayMs });
  const findCueIndexAtTime =
    typeof helpers.findCueIndexAtTime === "function"
      ? helpers.findCueIndexAtTime
      : () => -1;
  const formatCueTimeLabel =
    typeof helpers.formatCueTimeLabel === "function"
      ? helpers.formatCueTimeLabel
      : (seconds) => formatTime(seconds).slice(3, 8);
  const getPreviewViewState =
    typeof helpers.getPreviewViewState === "function"
      ? helpers.getPreviewViewState
      : ({ cues, activeCueIndex, autoFollow }) => ({
        mode: Array.isArray(cues) && cues.length > 0 ? "list" : "empty",
        activeCueIndex,
        showResumeButton: autoFollow === false
      });
  const getSubtitleMenuViewState =
    typeof helpers.getSubtitleMenuViewState === "function"
      ? helpers.getSubtitleMenuViewState
      : getPreviewViewState;
  const isShortcutEventAllowed =
    typeof helpers.isShortcutEventAllowed === "function"
      ? helpers.isShortcutEventAllowed
      : () => true;
  const formatShortcutToastMessage =
    typeof helpers.formatShortcutToastMessage === "function"
      ? helpers.formatShortcutToastMessage
      : () => "";
  let currentUiRoot = null;

  const button = document.createElement("button");
  button.className = "vso-button vso-hidden";
  button.type = "button";
  button.textContent = "字幕";

  const panel = document.createElement("div");
  panel.className = "vso-panel vso-hidden";
  panel.innerHTML = `
    <div class="vso-panel-title">字幕设置</div>
    <div class="vso-tabs" role="tablist" aria-label="字幕面板">
      <button id="vso-tab-load" class="vso-tab vso-tab-active" type="button" role="tab" aria-selected="true">加载</button>
      <button id="vso-tab-preview" class="vso-tab" type="button" role="tab" aria-selected="false">字幕</button>
      <button id="vso-tab-library" class="vso-tab" type="button" role="tab" aria-selected="false">历史收藏</button>
      <button id="vso-tab-settings" class="vso-tab" type="button" role="tab" aria-selected="false">设置</button>
    </div>
    <div id="vso-panel-load" class="vso-tab-panel">
      <div class="vso-grid">
        <div class="vso-search-shell">
          <div class="vso-search-header">
            <div class="vso-panel-heading">搜索字幕</div>
            <div class="vso-panel-subtitle">直接搜索并加载，其他方式在下方展开。</div>
          </div>
          <div class="vso-source-row">
            <input id="vso-search-input" class="vso-text-input" type="text" placeholder="输入影片关键词">
            <button id="vso-search-button" class="vso-action vso-action-primary" type="button">搜索</button>
          </div>
          <div class="vso-current-subtitle vso-current-subtitle-compact">
            <div class="vso-current-subtitle-copy">
              <div class="vso-current-subtitle-label">当前字幕</div>
              <div id="vso-current-subtitle-name" class="vso-current-subtitle-name">未加载字幕</div>
            </div>
            <div class="vso-current-subtitle-actions">
              <button id="vso-current-toggle-visibility" class="vso-link-button vso-library-clear" type="button">隐藏</button>
              <button id="vso-clear-subtitle" class="vso-link-button vso-library-clear" type="button">清空</button>
            </div>
          </div>
          <div id="vso-search-feedback" class="vso-search-feedback">输入关键词后可从 Subtitle Cat 选择字幕。</div>
          <div id="vso-search-results" class="vso-search-results vso-hidden"></div>
        </div>
        <div class="vso-secondary-loads">
          <button id="vso-file-toggle" class="vso-disclosure" type="button" aria-expanded="false">
            <span>本地字幕</span>
            <span class="vso-disclosure-icon">+</span>
          </button>
          <div id="vso-load-panel-file" class="vso-load-panel vso-hidden">
            <div class="vso-field">
              <label for="vso-file-input">选择本地字幕文件</label>
              <input id="vso-file-input" class="vso-file" type="file" accept=".srt,.vtt,.ass,.ssa,.json,text/plain">
            </div>
          </div>
          <button id="vso-url-toggle" class="vso-disclosure" type="button" aria-expanded="false">
            <span>在线链接</span>
            <span class="vso-disclosure-icon">+</span>
          </button>
          <div id="vso-load-panel-url" class="vso-load-panel vso-hidden">
            <div class="vso-manual-source">
              <div class="vso-manual-title">输入在线字幕链接</div>
              <div class="vso-manual-hint">粘贴可直接访问的 .srt / .vtt 等字幕链接。</div>
              <div class="vso-source-row">
                <input id="vso-url-input" class="vso-text-input" type="url" placeholder="https://example.com/subtitle.srt">
                <button id="vso-url-load" class="vso-action vso-action-secondary" type="button">加载链接</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="vso-panel-preview" class="vso-tab-panel vso-hidden">
      <div class="vso-preview-header">
        <div class="vso-preview-title">当前字幕</div>
        <button id="vso-preview-resume" class="vso-action vso-action-secondary vso-preview-resume vso-hidden" type="button">跟随播放</button>
      </div>
      <div id="vso-preview-empty" class="vso-preview-empty">加载字幕后会在这里显示全文。</div>
      <div id="vso-preview-list" class="vso-preview-list vso-hidden"></div>
      <div id="vso-selected-cue" class="vso-selected-cue">选择一句字幕，可查看全文或跳转。</div>
      <div class="vso-calibration-actions">
        <button id="vso-cue-seek" class="vso-action vso-action-secondary" type="button" disabled>跳转到这句</button>
        <button id="vso-calibrate-now" class="vso-action vso-action-primary" type="button" disabled>这句现在说</button>
        <button id="vso-calibrate-first" class="vso-action vso-action-secondary" type="button" disabled>标记第一句</button>
        <button id="vso-calibrate-second" class="vso-action vso-action-secondary" type="button" disabled>标记第二句并校准</button>
        <button id="vso-calibrate-reset" class="vso-action vso-action-secondary" type="button">重置时间校准</button>
      </div>
      <div class="vso-manual-hint">先选中台词，在听到这句时点「这句现在说」。若越播越不同步，分别在前后两句说出时标记第一句和第二句；间隔越远越容易校准。</div>
      <div id="vso-calibration-status" class="vso-manual-hint" aria-live="polite"></div>
    </div>
    <div id="vso-panel-library" class="vso-tab-panel vso-hidden">
      <div class="vso-library-section">
        <div class="vso-library-header">
          <div class="vso-manual-title">历史与收藏</div>
          <button id="vso-records-clear-all" class="vso-link-button vso-library-clear" type="button">清空全部记录</button>
        </div>
        <div class="vso-library-actions">
          <button id="vso-page-memory-clear" class="vso-link-button vso-library-clear" type="button">清除当前页面记忆</button>
          <span class="vso-library-hint">清空全部记录会同时清掉最近使用、我的收藏和所有页面记忆。</span>
        </div>
        <div class="vso-library-group">
          <div class="vso-library-title">最近使用</div>
          <div id="vso-history-empty" class="vso-language-empty">还没有字幕使用记录。</div>
          <div id="vso-history-list" class="vso-library-list vso-hidden"></div>
          <div class="vso-library-actions">
            <button id="vso-history-clear" class="vso-link-button vso-library-clear" type="button">清空历史</button>
          </div>
        </div>
        <div class="vso-library-group">
          <div class="vso-library-title">我的收藏</div>
          <div id="vso-favorites-empty" class="vso-language-empty">还没有收藏字幕来源。</div>
          <div id="vso-favorites-list" class="vso-library-list vso-hidden"></div>
          <div class="vso-library-actions">
            <button id="vso-favorites-clear" class="vso-link-button vso-library-clear" type="button">清空收藏</button>
          </div>
        </div>
      </div>
    </div>
    <div id="vso-panel-settings" class="vso-tab-panel vso-hidden">
      <div class="vso-grid">
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
        <div class="vso-field">
          <div class="vso-toggle-row">
            <input id="vso-keep-records" class="vso-toggle" type="checkbox">
            <label for="vso-keep-records">不保留任何记录</label>
          </div>
          <div class="vso-manual-hint">选中后不保存最近使用、页面记忆和搜索关键词；首次选中会立即清空已有的历史、收藏和页面记忆。</div>
        </div>
        <div class="vso-field">
          <span>快捷键</span>
          <div class="vso-shortcut-hint">[ 提前 0.5s，] 延后 0.5s，H 显示或隐藏字幕，S 打开或关闭面板。</div>
        </div>
        <div class="vso-action-row">
          <button id="vso-hide-subtitles" class="vso-action vso-action-secondary" type="button">隐藏字幕</button>
          <button id="vso-reset" class="vso-action vso-action-primary" type="button">恢复默认</button>
        </div>
      </div>
    </div>
    <div id="vso-status" class="vso-status">未加载字幕</div>
  `;

  const subtitleLayer = document.createElement("div");
  subtitleLayer.className = "vso-subtitle-layer vso-hidden";
  const subtitleBox = document.createElement("div");
  subtitleBox.className = "vso-subtitle-box";
  subtitleLayer.appendChild(subtitleBox);
  const toastLayer = document.createElement("div");
  toastLayer.className = "vso-toast-layer vso-hidden";
  const toastBox = document.createElement("div");
  toastBox.className = "vso-toast-box";
  toastLayer.appendChild(toastBox);

  function removeUi() {
    button.remove();
    panel.remove();
    subtitleLayer.remove();
    toastLayer.remove();
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
    nextRoot.append(button, panel, subtitleLayer, toastLayer);
    currentUiRoot = nextRoot;
  }

  const ui = {
    tabLoad: panel.querySelector("#vso-tab-load"),
    tabPreview: panel.querySelector("#vso-tab-preview"),
    tabLibrary: panel.querySelector("#vso-tab-library"),
    tabSettings: panel.querySelector("#vso-tab-settings"),
    loadPanel: panel.querySelector("#vso-panel-load"),
    previewPanel: panel.querySelector("#vso-panel-preview"),
    libraryPanel: panel.querySelector("#vso-panel-library"),
    settingsPanel: panel.querySelector("#vso-panel-settings"),
    currentToggleVisibilityButton: panel.querySelector("#vso-current-toggle-visibility"),
    fileToggleButton: panel.querySelector("#vso-file-toggle"),
    urlToggleButton: panel.querySelector("#vso-url-toggle"),
    loadPanelFile: panel.querySelector("#vso-load-panel-file"),
    loadPanelUrl: panel.querySelector("#vso-load-panel-url"),
    currentSubtitleName: panel.querySelector("#vso-current-subtitle-name"),
    clearSubtitleButton: panel.querySelector("#vso-clear-subtitle"),
    fileInput: panel.querySelector("#vso-file-input"),
    searchInput: panel.querySelector("#vso-search-input"),
    searchButton: panel.querySelector("#vso-search-button"),
    searchFeedback: panel.querySelector("#vso-search-feedback"),
    searchResults: panel.querySelector("#vso-search-results"),
    urlInput: panel.querySelector("#vso-url-input"),
    urlLoadButton: panel.querySelector("#vso-url-load"),
    pageMemoryClearButton: panel.querySelector("#vso-page-memory-clear"),
    historyList: panel.querySelector("#vso-history-list"),
    historyEmpty: panel.querySelector("#vso-history-empty"),
    historyClearButton: panel.querySelector("#vso-history-clear"),
    recordsClearAllButton: panel.querySelector("#vso-records-clear-all"),
    keepRecordsToggle: panel.querySelector("#vso-keep-records"),
    favoritesList: panel.querySelector("#vso-favorites-list"),
    favoritesEmpty: panel.querySelector("#vso-favorites-empty"),
    favoritesClearButton: panel.querySelector("#vso-favorites-clear"),
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

  ui.previewResumeButton = panel.querySelector("#vso-preview-resume");
  ui.previewEmpty = panel.querySelector("#vso-preview-empty");
  ui.previewList = panel.querySelector("#vso-preview-list");

  ui.selectedCue = panel.querySelector("#vso-selected-cue");
  ui.cueSeek = panel.querySelector("#vso-cue-seek");
  ui.calibrateNow = panel.querySelector("#vso-calibrate-now");
  ui.calibrateFirst = panel.querySelector("#vso-calibrate-first");
  ui.calibrateSecond = panel.querySelector("#vso-calibrate-second");
  ui.calibrateReset = panel.querySelector("#vso-calibrate-reset");
  ui.calibrationStatus = panel.querySelector("#vso-calibration-status");
  const previewList = globalThis.__VSO_PREVIEW__.createPreviewList(ui.previewList, {
    formatTime: formatCueTimeLabel,
    onSelect(index) {
      state.selectedCueIndex = index;
      setPreviewAutoFollow(false);
      ui.selectedCue.textContent = state.cues[index].text;
      updateCalibrationControls();
      renderPreview();
    }
  });
  ui.cueSeek.addEventListener("click", () => {
    const cue = state.cues[state.selectedCueIndex];
    if (!cue || !state.activeVideo) return;
    state.activeVideo.currentTime = timing.videoTime(cue.start, currentTiming());
    renderSubtitle();
  });

  function updateCalibrationControls() {
    const hasSelection = Boolean(state.cues[state.selectedCueIndex] && state.activeVideo);
    ui.cueSeek.disabled = !hasSelection;
    ui.calibrateNow.disabled = !hasSelection;
    ui.calibrateFirst.disabled = !hasSelection;
    ui.calibrateSecond.disabled = !hasSelection || !state.calibrationAnchor;
    ui.calibrationStatus.textContent = `偏移 ${formatDelayLabel(state.settings.delayMs)} · 时间比例 ${state.timingRate.toFixed(5)}`
      + (state.calibrationAnchor ? ` · 第一句已标记：${formatCueTimeLabel(state.calibrationAnchor.cue)}，请选择后面的台词` : "");
  }

  function selectedAnchor() {
    const cue = state.cues[state.selectedCueIndex];
    return cue && state.activeVideo ? { cue: cue.start, video: state.activeVideo.currentTime } : null;
  }

  function applyTiming(value) {
    const normalized = timing.normalize(value);
    state.timingRate = normalized.rate;
    state.settings.delayMs = normalized.delayMs;
    state.calibrationAnchor = null;
    syncControls();
    persistCurrentPageMemory();
    renderSubtitle();
  }

  ui.calibrateNow.addEventListener("click", () => {
    const anchor = selectedAnchor();
    if (!anchor) return;
    try {
      applyTiming(timing.calibrateOne(anchor.cue, anchor.video, state.timingRate));
      setStatus("已将这句字幕对齐到当前视频时间");
    } catch (error) { setStatus(error.message); }
  });
  ui.calibrateFirst.addEventListener("click", () => {
    state.calibrationAnchor = selectedAnchor();
    updateCalibrationControls();
  });
  ui.calibrateSecond.addEventListener("click", () => {
    const second = selectedAnchor();
    if (!second || !state.calibrationAnchor) return;
    try {
      applyTiming(timing.calibrateTwo(state.calibrationAnchor, second));
      setStatus("已按两句台词校准字幕偏移和时间比例");
    } catch (error) { setStatus(error.message); }
  });
  ui.calibrateReset.addEventListener("click", () => {
    applyTiming({ rate: 1, delayMs: 0 });
    setStatus("已重置当前播放器的时间校准");
  });

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

  function setSearchFeedback(message, tone = "") {
    ui.searchFeedback.textContent = message;
    ui.searchFeedback.dataset.tone = tone;
  }

  let sharedRevision = 0;
  let sharedRefreshQueued = false;
  function saveSettings(patch) {
    return mutateStorage({ action: "settings.patch", patch });
  }

  async function mutateStorage(command) {
    try {
      await requestBackgroundMessage({ type: "vso-storage-action", ...command });
      if (state.siteEnabled) queueSharedRefresh();
      return true;
    } catch (error) {
      setStatus(error.message || "保存失败");
      if (state.siteEnabled) queueSharedRefresh();
      return false;
    }
  }

  function queueSharedRefresh() {
    if (sharedRefreshQueued || !state.siteEnabled) return;
    sharedRefreshQueued = true;
    queueMicrotask(() => {
      sharedRefreshQueued = false;
      if (state.siteEnabled) void loadSharedState();
    });
  }

  async function loadSharedState() {
    const revision = ++sharedRevision;
    const generation = activationGeneration;
    try {
      const { snapshot } = await requestBackgroundMessage({ type: "vso-storage-action", action: "snapshot" });
      if (revision !== sharedRevision || generation !== activationGeneration || !state.siteEnabled) return;
      const oldPrivacy = shouldKeepRecords();
      const localDelay = state.settings.delayMs;
      state.settings = { ...DEFAULT_SETTINGS, ...snapshot[STORAGE_KEY] };
      // Appearance and privacy are shared. Timing belongs to this player.
      if (state.settingsLoaded) state.settings.delayMs = localDelay;
      state.pageMemory = snapshot[PAGE_MEMORY_STORAGE_KEY] || {};
      state.history = snapshot[HISTORY_STORAGE_KEY] || [];
      state.favorites = snapshot[FAVORITES_STORAGE_KEY] || [];
      state.settingsLoaded = true;
      state.libraryLoaded = true;
      if (oldPrivacy && !shouldKeepRecords()) {
        state.searchKeyword = "";
        ui.searchInput.value = "";
      }
      syncControls();
      updateCurrentSubtitleDisplay();
      renderLibrary();
      renderSubtitle();
      void restorePageMemoryIfNeeded();
    } catch (error) {
      if (generation === activationGeneration && state.siteEnabled) setStatus(error.message || "读取设置失败");
    }
  }

  function handleStorageChange(changes, area) {
    if (area === "local" && [STORAGE_KEY, PAGE_MEMORY_STORAGE_KEY, HISTORY_STORAGE_KEY, FAVORITES_STORAGE_KEY].some((key) => key in changes)) queueSharedRefresh();
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
    ui.keepRecordsToggle.checked = !shouldKeepRecords();
    updateSubtitleStyles();
    updateHideButtonLabel();
    updateCalibrationControls();
  }

  function updateSearchControls() {
    ui.searchButton.disabled = state.searchLoading;
  }

  function updateCurrentSubtitleDisplay() {
    const source = getCurrentPageMemorySource();
    ui.currentSubtitleName.textContent = source?.label || "未加载字幕";
    ui.clearSubtitleButton.disabled = !source && state.cues.length === 0;
    ui.currentToggleVisibilityButton.textContent = state.subtitleVisible ? "隐藏" : "显示";
  }

  function showToast(message) {
    if (!message) {
      return;
    }

    toastBox.textContent = message;
    toastLayer.classList.remove("vso-hidden");
    toastLayer.classList.add("vso-toast-visible");

    window.clearTimeout(state.toastTimer || 0);
    state.toastTimer = window.setTimeout(() => {
      toastLayer.classList.remove("vso-toast-visible");
      toastLayer.classList.add("vso-hidden");
    }, 1200);
  }

  function getCurrentPageUrl() {
    if (window === window.top) return window.location.href;
    // about:blank/srcdoc and reused embed URLs are not unique to a watch page.
    // Keep frame records scoped to the owning page without reading its DOM.
    return state.sitePageUrl
      ? `${state.sitePageUrl}#vso-frame=${encodeURIComponent(window.location.href)}`
      : "";
  }

  function createListEntryId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getSourceSiteLabel(url) {
    if (!url) {
      return "local";
    }

    try {
      return new URL(url).hostname || "remote";
    } catch (error) {
      return "remote";
    }
  }

  function buildSubtitleSource(kind, label, url = "") {
    return {
      kind,
      label,
      url,
      sourceSite: kind === "local" ? "local" : getSourceSiteLabel(url)
    };
  }

  function buildListEntryFromSource(source) {
    return {
      id: createListEntryId("vso"),
      kind: source.kind,
      label: source.label,
      url: source.url || "",
      sourceSite: source.sourceSite || getSourceSiteLabel(source.url || ""),
      pageUrl: getCurrentPageUrl(),
      createdAt: Date.now()
    };
  }

  function isSameFavoriteSource(left, right) {
    if (!left || !right) {
      return false;
    }

    if (left.kind !== right.kind) {
      return false;
    }

    if (left.kind === "local") {
      return left.label === right.label;
    }

    return Boolean(left.url) && left.url === right.url;
  }

  function isFavoriteEntry(entry) {
    return state.favorites.some((favorite) => isSameFavoriteSource(favorite, entry));
  }

  function updateHideButtonLabel() {
    ui.hideButton.textContent = state.subtitleVisible ? "隐藏字幕" : "显示字幕";
  }

  // 默认不保留任何记录：只有用户主动关掉「不保留任何记录」才写入存储。
  const shouldKeepRecordsSetting =
    typeof helpers.shouldKeepRecords === "function"
      ? helpers.shouldKeepRecords
      : (settings) => settings?.keepRecords === true;

  function shouldKeepRecords() {
    return shouldKeepRecordsSetting(state.settings);
  }

  function savePageRecord(record) {
    return mutateStorage({ action: "page.upsert", pageUrl: getCurrentPageUrl(), record });
  }

  function getCurrentPageMemorySource() {
    const record = state.pageMemory[getCurrentPageUrl()];
    return state.currentSubtitleSource || record?.subtitleSource || null;
  }

  function persistCurrentPageMemory() {
    if (!shouldKeepRecords()) {
      return;
    }

    const subtitleSource = getCurrentPageMemorySource();
    if (!subtitleSource) {
      return;
    }

    void savePageRecord({
      delayMs: state.settings.delayMs,
      timingRate: state.timingRate || 1,
      subtitleSource,
      updatedAt: Date.now()
    });
  }

  function persistSubtitleUsage(source) {
    state.currentSubtitleSource = source;
    updateCurrentSubtitleDisplay();
    if (!shouldKeepRecords()) return;
    persistCurrentPageMemory();
    void mutateStorage({ action: "history.upsert", entry: buildListEntryFromSource(source) });
  }

  function createRemoteRestoreMessage(source) {
    return `已恢复上次字幕 ${source.label}`;
  }

  async function restorePageMemoryIfNeeded() {
    if (
      state.pageMemoryRestored || restoreInProgress ||
      !state.settingsLoaded ||
      !state.siteStateLoaded ||
      !state.libraryLoaded ||
      !state.siteEnabled
    ) {
      return;
    }

    const record = state.pageMemory[getCurrentPageUrl()];
    if (!record) {
      state.pageMemoryRestored = true;
      return;
    }

    state.timingRate = timing.normalize({ rate: record.timingRate }).rate;
    if (Number.isFinite(record.delayMs)) {
      state.settings.delayMs = record.delayMs;
      syncControls();
    }

    if (!record.subtitleSource) {
      state.pageMemoryRestored = true;
      return;
    }

    state.currentSubtitleSource = { ...record.subtitleSource };
    updateCurrentSubtitleDisplay();

    if (record.subtitleSource.kind === "local") {
      state.pageMemoryRestored = true;
      setStatus(`已恢复偏移；上次使用本地字幕 ${record.subtitleSource.label}，请重新选择文件`);
      return;
    }

    if (!record.subtitleSource.url) {
      state.pageMemoryRestored = true;
      return;
    }

    restoreInProgress = true;
    const generation = activationGeneration;
    try {
      await loadSubtitleUrl(record.subtitleSource.url, record.subtitleSource, createRemoteRestoreMessage, true);
    } catch (error) {
      if (generation === activationGeneration) {
        state.pageMemoryRestored = true;
        setStatus(error instanceof Error ? error.message : "自动恢复字幕失败");
      }
    } finally {
      if (generation === activationGeneration) restoreInProgress = false;
    }
  }

  function setPanelTab(tab) {
    state.panelTab = tab === "preview" || tab === "library" || tab === "settings" ? tab : "load";
    const showingLoad = state.panelTab === "load";
    const showingPreview = state.panelTab === "preview";
    const showingLibrary = state.panelTab === "library";
    const showingSettings = state.panelTab === "settings";
    ui.tabLoad.classList.toggle("vso-tab-active", showingLoad);
    ui.tabPreview.classList.toggle("vso-tab-active", showingPreview);
    ui.tabLibrary.classList.toggle("vso-tab-active", showingLibrary);
    ui.tabSettings.classList.toggle("vso-tab-active", showingSettings);
    ui.tabLoad.setAttribute("aria-selected", String(showingLoad));
    ui.tabPreview.setAttribute("aria-selected", String(showingPreview));
    ui.tabLibrary.setAttribute("aria-selected", String(showingLibrary));
    ui.tabSettings.setAttribute("aria-selected", String(showingSettings));
    ui.loadPanel.classList.toggle("vso-hidden", !showingLoad);
    ui.previewPanel.classList.toggle("vso-hidden", !showingPreview);
    ui.libraryPanel.classList.toggle("vso-hidden", !showingLibrary);
    ui.settingsPanel.classList.toggle("vso-hidden", !showingSettings);
    if (showingPreview) {
      renderPreview(true);
    }
  }

  function setLoadDisclosure(section) {
    state.expandedLoadSection = state.expandedLoadSection === section ? "" : section;
    const fileOpen = state.expandedLoadSection === "file";
    const urlOpen = state.expandedLoadSection === "url";
    ui.fileToggleButton.setAttribute("aria-expanded", String(fileOpen));
    ui.urlToggleButton.setAttribute("aria-expanded", String(urlOpen));
    ui.fileToggleButton.classList.toggle("vso-disclosure-open", fileOpen);
    ui.urlToggleButton.classList.toggle("vso-disclosure-open", urlOpen);
    ui.fileToggleButton.querySelector(".vso-disclosure-icon").textContent = fileOpen ? "−" : "+";
    ui.urlToggleButton.querySelector(".vso-disclosure-icon").textContent = urlOpen ? "−" : "+";
    ui.loadPanelFile.classList.toggle("vso-hidden", !fileOpen);
    ui.loadPanelUrl.classList.toggle("vso-hidden", !urlOpen);
  }

  function applySiteEnabled(enabled, pageUrl) {
    state.sitePageUrl = pageUrl;
    state.siteStateLoaded = true;
    if (state.siteEnabled === enabled) return;
    state.siteEnabled = enabled;
    activationGeneration += 1;
    if (!enabled) {
      subtitleLoadRevision += 1;
      restoreInProgress = false;
      activeAbort?.abort();
      activeAbort = null;
      observer.disconnect();
      chrome.storage.onChanged.removeListener(handleStorageChange);
      sharedRevision += 1;
      for (const video of boundVideos.keys()) unbindVideo(video);
      state.videos.clear();
      state.activeVideo = null;
      state.panelOpen = false;
      state.hoverLocked = false;
      window.clearTimeout(state.previewIgnoreTimer);
      window.clearTimeout(state.toastTimer);
      window.clearTimeout(clearAllTimer);
      clearAllArmed = false;
      ui.recordsClearAllButton.textContent = "清空全部记录";
      [button, panel, subtitleLayer, toastLayer].forEach((node) => node.classList.add("vso-hidden"));
      removeUi();
      return;
    }
    activeAbort = new AbortController();
    for (const { target, type, listener, options } of activeListeners) {
      target.addEventListener(type, listener, {
        ...(typeof options === "boolean" ? { capture: options } : options),
        signal: activeAbort.signal
      });
    }
    observer.observe(document.documentElement, { childList: true, subtree: true });
    chrome.storage.onChanged.addListener(handleStorageChange);
    void loadSharedState();
    scanVideos();
    refreshActiveVideo();
    syncUiRoot();
    positionButton();
    renderSubtitle();
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

  // WebVTT 的 cue 参数（align:start line:0%）和 SRT 的定位标签（X1:.. Y1:..）会跟在时间码后面，
  // 直接按冒号全切会得到 4 段以上而整条作废，所以这里只取开头那段纯时间码。
  function extractTimestampToken(input) {
    const match = String(input || "")
      .trim()
      .match(/^\d{1,3}:\d{1,2}:\d{1,2}[.,]\d{1,3}|^\d{1,3}:\d{1,2}[.,]\d{1,3}/);
    return match ? match[0] : String(input || "").trim().split(/\s+/)[0];
  }

  function parseTimestamp(input) {
    const normalized = extractTimestampToken(input).replace(",", ".");
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
      const text = normalizeText(textLines.join("\n"));
      if (!text) {
        continue;
      }
      cues.push({
        start,
        end,
        text
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
      toastLayer.classList.add("vso-hidden");
      return;
    }

    button.classList.remove("vso-hidden");
    button.style.top = `${Math.max(12, rect.top + 12)}px`;
    button.style.left = `${Math.max(12, rect.right - button.offsetWidth - 12)}px`;

    if (state.panelOpen) {
      panel.classList.remove("vso-hidden");
      const panelTop = Math.max(12, Math.min(
        window.innerHeight - panel.offsetHeight - 12,
        Math.max(12, rect.top + 56)
      ));
      const panelLeft = Math.max(12, Math.min(
        window.innerWidth - panel.offsetWidth - 12,
        Math.max(12, rect.right - panel.offsetWidth)
      ));
      panel.style.top = `${panelTop}px`;
      panel.style.left = `${panelLeft}px`;
    }

    subtitleLayer.style.left = `${Math.max(0, rect.left)}px`;
    subtitleLayer.style.top = `${Math.max(0, rect.top)}px`;
    subtitleLayer.style.width = `${Math.max(0, rect.width)}px`;
    subtitleLayer.style.height = `${Math.max(0, rect.height)}px`;
    toastLayer.style.left = `${Math.max(0, rect.left)}px`;
    toastLayer.style.top = `${Math.max(0, rect.top)}px`;
    toastLayer.style.width = `${Math.max(0, rect.width)}px`;
    toastLayer.style.height = `${Math.max(0, rect.height)}px`;
  }

  function buildPreviewList() {
    previewList.setCues(state.cues);
    state.selectedCueIndex = -1;
    state.previewScrollIndex = -1;
    ui.selectedCue.textContent = "选择一句字幕，可查看全文或跳转。";
    state.calibrationAnchor = null;
    updateCalibrationControls();
  }

  function setPreviewAutoFollow(enabled) {
    state.previewAutoFollow = enabled;
    ui.previewResumeButton.classList.toggle("vso-hidden", enabled);
  }

  function syncPreviewScroll(force = false) {
    if (!state.siteEnabled || !state.panelOpen || state.panelTab !== "preview" || (!force && !state.previewAutoFollow)) return;
    state.previewIgnoreScroll = true;
    window.clearTimeout(state.previewIgnoreTimer);
    previewList.scrollToIndex(state.previewScrollIndex);
    state.previewIgnoreTimer = window.setTimeout(() => { state.previewIgnoreScroll = false; }, 120);
  }

  function renderPreview(forceScroll = false) {
    if (!state.siteEnabled || !state.panelOpen || state.panelTab !== "preview") return;
    const previousIndex = state.previewScrollIndex;
    const viewState = getSubtitleMenuViewState({
      cues: state.cues,
      activeCueIndex: state.activeCueIndex,
      autoFollow: state.previewAutoFollow,
      currentTime: state.activeVideo
        ? timing.subtitleTime(state.activeVideo.currentTime, currentTiming())
        : 0
    });
    state.previewScrollIndex = viewState.activeCueIndex >= 0
      ? viewState.activeCueIndex
      : viewState.upcomingCueIndex >= 0
        ? viewState.upcomingCueIndex
        : viewState.recentCueIndex;

    const isEmpty = viewState.mode === "empty";
    ui.previewEmpty.classList.toggle("vso-hidden", !isEmpty);
    ui.previewList.classList.toggle("vso-hidden", isEmpty);
    ui.previewResumeButton.classList.toggle(
      "vso-hidden",
      isEmpty || viewState.showResumeButton === false
    );

    if (isEmpty) {
      return;
    }

    if (forceScroll || (state.previewAutoFollow && previousIndex !== state.previewScrollIndex)) syncPreviewScroll(forceScroll);
    previewList.render(viewState, state.selectedCueIndex);
  }

  function renderSubtitle() {
    if (!state.siteEnabled) {
      subtitleBox.textContent = "";
      subtitleLayer.classList.add("vso-hidden");
      state.activeCueIndex = -1;
      renderPreview();
      return;
    }
    const video = state.activeVideo;
    if (!video || state.cues.length === 0) {
      subtitleBox.textContent = "";
      subtitleLayer.classList.add("vso-hidden");
      state.activeCueIndex = -1;
      renderPreview();
      return;
    }

    const rect = getVisibleRect(video);
    if (!rect) {
      subtitleBox.textContent = "";
      subtitleLayer.classList.add("vso-hidden");
      state.activeCueIndex = -1;
      renderPreview();
      return;
    }

    const time = timing.subtitleTime(video.currentTime, currentTiming());
    state.activeCueIndex = findCueIndexAtTime(state.cues, time);
    const cue = state.activeCueIndex >= 0 ? state.cues[state.activeCueIndex] : null;
    const nextText = cue ? cue.text : "";
    if (subtitleBox.textContent !== nextText) subtitleBox.textContent = nextText;
    subtitleLayer.classList.toggle("vso-hidden", !cue || !state.subtitleVisible);
    renderPreview();
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
      renderSubtitle();
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
      if (state.siteEnabled && !state.hoverLocked) {
        refreshActiveVideo();
      }
    }, 120);
  }

  function attachVideoListeners(video) {
    if (!activeAbort || boundVideos.has(video)) {
      return;
    }
    video.dataset.vsoBound = "1";
    const videoAbort = new AbortController();
    boundVideos.set(video, videoAbort);
    const options = { signal: videoAbort.signal };
    video.addEventListener("mouseenter", handleVideoHover, options);
    video.addEventListener("mouseleave", handleVideoLeave, options);
    video.addEventListener("timeupdate", renderSubtitle, options);
    video.addEventListener("seeked", renderSubtitle, options);
    video.addEventListener("play", () => setActiveVideo(video), options);
    video.addEventListener("pause", renderSubtitle, options);
  }

  function unbindVideo(video) {
    boundVideos.get(video)?.abort();
    boundVideos.delete(video);
    delete video.dataset.vsoBound;
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
  }

  function togglePanel(forceOpen) {
    if (!state.siteEnabled) {
      return;
    }
    state.panelOpen = typeof forceOpen === "boolean" ? forceOpen : !state.panelOpen;
    panel.classList.toggle("vso-hidden", !state.panelOpen);
    if (state.panelOpen) {
      positionButton();
      renderPreview(true);
    }
  }

  function requestBackgroundMessage(message) {
    return new Promise((resolve, reject) => {
      if (!chrome.runtime?.sendMessage) {
        reject(new Error("后台服务不可用"));
        return;
      }

      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime?.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "后台请求失败"));
          return;
        }

        if (!response?.ok) {
          reject(new Error(response?.error || "请求失败"));
          return;
        }

        resolve(response);
      });
    });
  }

  function renderSearchResults() {
    const previousScrollTop = ui.searchResults.scrollTop;
    ui.searchResults.textContent = "";
    const hasResults = state.searchResults.length > 0;
    ui.searchResults.classList.toggle("vso-hidden", !hasResults);

    if (!hasResults) {
      return;
    }

    state.searchResults.forEach((result) => {
      const item = document.createElement("div");
      item.className = "vso-search-item";
      item.dataset.detailUrl = result.detailUrl;
      if (state.expandedResultUrl === result.detailUrl) {
        item.classList.add("vso-search-item-expanded");
      }

      const header = document.createElement("div");
      header.className = "vso-search-item-button";
      header.tabIndex = 0;
      header.setAttribute("role", "button");

      const title = document.createElement("div");
      title.className = "vso-search-item-title";
      title.textContent = result.title;

      const meta = document.createElement("div");
      meta.className = "vso-search-item-meta";
      meta.textContent = `${result.sizeLabel} · ${result.downloadLabel} · ${result.languageCountLabel}`;

      header.append(title, meta);
      item.appendChild(header);

      if (state.expandedResultUrl === result.detailUrl) {
        const detail = document.createElement("div");
        detail.className = "vso-language-panel";

        if (state.languageLoadingUrl === result.detailUrl) {
          const loading = document.createElement("div");
          loading.className = "vso-language-empty";
          loading.textContent = "正在加载可下载语言...";
          detail.appendChild(loading);
        } else if (state.languageErrorByUrl[result.detailUrl]) {
          const error = document.createElement("div");
          error.className = "vso-language-empty";
          error.textContent = state.languageErrorByUrl[result.detailUrl];
          detail.appendChild(error);
        } else {
          const languages = state.languageOptionsByUrl[result.detailUrl] || [];

          if (languages.length === 0) {
            const empty = document.createElement("div");
            empty.className = "vso-language-empty";
            empty.textContent = "该条字幕暂无可下载语言。";
            detail.appendChild(empty);
          } else {
            languages.forEach((option) => {
              const button = document.createElement("button");
              button.className = "vso-language-button";
              button.type = "button";
              button.textContent = option.languageLabel;
              button.dataset.detailUrl = result.detailUrl;
              button.dataset.downloadUrl = option.downloadUrl;
              button.disabled = state.downloadingLanguageUrl === option.downloadUrl;
              detail.appendChild(button);
            });
          }
        }

        item.appendChild(detail);
      }

      ui.searchResults.appendChild(item);
    });

    ui.searchResults.scrollTop = previousScrollTop;
  }

  function formatRelativeTime(timestamp) {
    if (!Number.isFinite(timestamp)) {
      return "";
    }

    const diffMs = Math.max(0, Date.now() - timestamp);
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) {
      return "刚刚";
    }

    if (diffMinutes < 60) {
      return `${diffMinutes} 分钟前`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} 小时前`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} 天前`;
  }

  function renderLibraryList(container, emptyNode, entries, type) {
    container.textContent = "";
    const hasEntries = entries.length > 0;
    container.classList.toggle("vso-hidden", !hasEntries);
    emptyNode.classList.toggle("vso-hidden", hasEntries);

    if (!hasEntries) {
      return;
    }

    entries.forEach((entry) => {
      let pageHost = entry.pageUrl || "";
      if (pageHost) {
        try {
          pageHost = new URL(entry.pageUrl).hostname || entry.pageUrl;
        } catch (error) {
          pageHost = entry.pageUrl;
        }
      }

      const item = document.createElement("div");
      item.className = "vso-library-item";
      item.dataset.entryId = entry.id;
      item.dataset.listType = type;

      const title = document.createElement("div");
      title.className = "vso-library-item-title";
      title.textContent = entry.label || "未命名字幕";

      const meta = document.createElement("div");
      meta.className = "vso-library-item-meta";
      meta.textContent = [
        entry.kind === "subtitlecat" ? "Subtitle Cat" : entry.kind === "local" ? "本地文件" : "在线链接",
        entry.sourceSite || "",
        pageHost,
        formatRelativeTime(entry.createdAt)
      ].filter(Boolean).join(" · ");

      const actions = document.createElement("div");
      actions.className = "vso-library-item-actions";

      const loadButton = document.createElement("button");
      loadButton.className = "vso-link-button vso-library-action";
      loadButton.type = "button";
      loadButton.dataset.action = "load";
      loadButton.textContent = "加载";
      actions.appendChild(loadButton);

      if (type === "history") {
        const favoriteButton = document.createElement("button");
        favoriteButton.className = "vso-link-button vso-library-action";
        favoriteButton.type = "button";
        favoriteButton.dataset.action = isFavoriteEntry(entry) ? "unfavorite" : "favorite";
        favoriteButton.textContent = isFavoriteEntry(entry) ? "取消收藏" : "收藏";
        actions.appendChild(favoriteButton);
      } else {
        const favoriteButton = document.createElement("button");
        favoriteButton.className = "vso-link-button vso-library-action";
        favoriteButton.type = "button";
        favoriteButton.dataset.action = "unfavorite";
        favoriteButton.textContent = "取消收藏";
        actions.appendChild(favoriteButton);
      }

      const deleteButton = document.createElement("button");
      deleteButton.className = "vso-link-button vso-library-action";
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete";
      deleteButton.textContent = "删除";
      actions.appendChild(deleteButton);

      item.append(title, meta, actions);
      container.appendChild(item);
    });
  }

  function renderLibrary() {
    updateCurrentSubtitleDisplay();
    renderLibraryList(ui.historyList, ui.historyEmpty, state.history, "history");
    renderLibraryList(ui.favoritesList, ui.favoritesEmpty, state.favorites, "favorites");
  }

  async function searchSubtitleByKeyword(keyword) {
    state.searchKeyword = String(keyword || "").trim();
    state.searchLoading = true;
    state.searchError = "";
    state.expandedResultUrl = "";
    setSearchFeedback("正在搜索字幕...");
    updateSearchControls();
    renderSearchResults();

    try {
      const response = await requestBackgroundMessage({
        type: "vso-search-subtitlecat",
        keyword: state.searchKeyword
      });

      state.searchResults = response.results || [];
      setSearchFeedback(`找到 ${state.searchResults.length} 条字幕结果，点开后可选择语言。`, "success");
    } catch (error) {
      state.searchResults = [];
      state.searchError = error instanceof Error ? error.message : "搜索字幕失败";
      setSearchFeedback(state.searchError, "error");
    } finally {
      state.searchLoading = false;
      updateSearchControls();
      renderSearchResults();
    }
  }

  async function expandSearchResult(result) {
    state.expandedResultUrl = result.detailUrl;
    state.languageErrorByUrl[result.detailUrl] = "";

    if (state.languageOptionsByUrl[result.detailUrl]?.length) {
      renderSearchResults();
      return;
    }

    state.languageLoadingUrl = result.detailUrl;
    renderSearchResults();

    try {
      const response = await requestBackgroundMessage({
        type: "vso-fetch-subtitlecat-languages",
        detailUrl: result.detailUrl
      });

      state.languageOptionsByUrl[result.detailUrl] = response.languages || [];
    } catch (error) {
      state.languageErrorByUrl[result.detailUrl] = error instanceof Error
        ? error.message
        : "语言列表加载失败";
    } finally {
      state.languageLoadingUrl = "";
      renderSearchResults();
    }
  }

  async function downloadSearchResultLanguage(option) {
    state.downloadingLanguageUrl = option.downloadUrl;
    renderSearchResults();
    setStatus(`正在下载 ${option.languageLabel} 字幕...`);

    try {
      await loadSubtitleUrl(
        option.downloadUrl,
        buildSubtitleSource(
          "subtitlecat",
          getSubtitleFilenameFromUrl(option.downloadUrl),
          option.downloadUrl
        )
      );
    } finally {
      state.downloadingLanguageUrl = "";
      renderSearchResults();
    }
  }

  function getSearchResultByDetailUrl(detailUrl) {
    return state.searchResults.find((item) => item.detailUrl === detailUrl) || null;
  }

  function getLanguageOptionByUrls(detailUrl, downloadUrl) {
    const languages = state.languageOptionsByUrl[detailUrl] || [];
    return languages.find((item) => item.downloadUrl === downloadUrl) || null;
  }

  function getEntryByListType(listType, entryId) {
    const list = listType === "favorites" ? state.favorites : state.history;
    return list.find((entry) => entry.id === entryId) || null;
  }

  async function loadSavedEntry(entry) {
    if (!entry) {
      return;
    }

    if (entry.kind === "local") {
      setStatus(`这是本地字幕记录 ${entry.label}，请重新选择文件`);
      return;
    }

    await loadSubtitleUrl(
      entry.url,
      buildSubtitleSource(entry.kind, entry.label, entry.url)
    );
  }

  function toggleFavoriteEntry(entry) {
    if (!entry) return;
    const existing = state.favorites.find((favorite) => isSameFavoriteSource(favorite, entry));
    if (existing) {
      void mutateStorage({ action: "favorites.remove", id: existing.id });
    } else {
      void mutateStorage({ action: "favorites.add", entry: { ...entry, id: createListEntryId("favorite"), createdAt: Date.now() } });
    }
  }

  function applyKeepRecordsSetting(keepRecords) {
    state.settings.keepRecords = keepRecords === true;
    syncControls();
    if (!keepRecords) {
      state.searchKeyword = "";
      ui.searchInput.value = "";
    }
    void saveSettings({ keepRecords: state.settings.keepRecords }).then((saved) => {
      if (saved) setStatus(keepRecords ? "将开始保留最近使用和页面记忆" : "已开启不保留任何记录，并清空已有记录");
    });
  }

  function clearStoredRecords({ includeFavorites }) {
    void mutateStorage({ action: "records.clear", includeFavorites }).then((saved) => {
      if (saved) setStatus("已清空记录");
    });
    state.searchKeyword = "";
    ui.searchInput.value = "";
  }

  function clearCurrentPageMemory() {
    void mutateStorage({ action: "page.remove", pageUrl: getCurrentPageUrl() }).then((saved) => {
      if (saved) setStatus("已清除当前页面记忆");
    });
  }

  function clearCurrentSubtitle() {
    subtitleLoadRevision += 1;
    state.pageMemoryRestored = true;
    state.settings.delayMs = 0;
    state.timingRate = 1;
    state.calibrationAnchor = null;
    state.cues = [];
    state.activeCueIndex = -1;
    buildPreviewList();
    state.previewAutoFollow = true;
    state.subtitleVisible = true;
    state.currentSubtitleSource = null;
    subtitleBox.textContent = "";
    subtitleLayer.classList.add("vso-hidden");
    updateHideButtonLabel();
    syncControls();

    const pageUrl = getCurrentPageUrl();
    const existingRecord = state.pageMemory[pageUrl];

    // 隐私模式下不写任何页面记忆，包括这条「已清空」的记录。
    if (shouldKeepRecords()) {
      void savePageRecord({ delayMs: state.settings.delayMs, timingRate: state.timingRate || 1, subtitleSource: null, updatedAt: Date.now() });
    }

    setStatus(existingRecord?.subtitleSource ? "已清空当前字幕" : "当前没有可清空的字幕");
    updateCurrentSubtitleDisplay();
  }

  function handleLibraryAction(listType, entryId, action) {
    const entry = getEntryByListType(listType, entryId);
    if (!entry) {
      return;
    }

    if (action === "load") {
      void loadSavedEntry(entry).catch((error) => {
        setStatus(error instanceof Error ? error.message : "字幕加载失败");
      });
      return;
    }

    if (action === "favorite" || action === "unfavorite") {
      toggleFavoriteEntry(entry);
      return;
    }

    if (action === "delete") {
      if (listType === "favorites") {
        void mutateStorage({ action: "favorites.remove", id: entryId });
      } else {
        void mutateStorage({ action: "history.remove", id: entryId });
      }
    }
  }

  function handleShortcut(event) {
    if (!isShortcutEventAllowed(event) || !state.siteEnabled || !state.activeVideo) {
      return;
    }

    if (event.key === "[") {
      event.preventDefault();
      adjustDelay(-DELAY_STEP_MS);
      showToast(formatShortcutToastMessage("delay", -DELAY_STEP_MS, formatDelayLabel(state.settings.delayMs)));
      return;
    }

    if (event.key === "]") {
      event.preventDefault();
      adjustDelay(DELAY_STEP_MS);
      showToast(formatShortcutToastMessage("delay", DELAY_STEP_MS, formatDelayLabel(state.settings.delayMs)));
      return;
    }

    const normalizedKey = event.key.toLowerCase();

    if (normalizedKey === "h") {
      event.preventDefault();
      state.subtitleVisible = !state.subtitleVisible;
      updateHideButtonLabel();
      setStatus(state.subtitleVisible ? "字幕已显示" : "字幕已隐藏");
      renderSubtitle();
      showToast(formatShortcutToastMessage("toggle-visibility", null, null, state.subtitleVisible));
      return;
    }

    if (normalizedKey === "s") {
      event.preventDefault();
      togglePanel();
      showToast(state.panelOpen ? "已打开字幕面板" : "已关闭字幕面板");
    }
  }

  async function loadSubtitleFile(file) {
    const revision = ++subtitleLoadRevision;
    state.pageMemoryRestored = true;
    const generation = activationGeneration;
    const content = await file.text();
    if (!state.siteEnabled || generation !== activationGeneration || revision !== subtitleLoadRevision) return;
    return loadSubtitleContent(
      file.name,
      content,
      buildSubtitleSource("local", file.name),
      (cueCount) => `已加载 ${file.name}，共 ${cueCount} 条字幕`
    );
  }

  function loadSubtitleContent(sourceName, content, source, buildSuccessMessage) {
    const cues = parseSubtitleFile(sourceName, content)
      .filter((cue) => cue.end >= cue.start)
      .sort((a, b) => a.start - b.start);

    if (cues.length === 0) {
      throw new Error("字幕文件解析后没有可用条目");
    }

    if (state.currentSubtitleSource && source && !isSameFavoriteSource(state.currentSubtitleSource, source)) {
      state.timingRate = 1;
      state.settings.delayMs = 0;
    }
    state.pageMemoryRestored = true;
    state.cues = cues;
    syncControls();
    state.activeCueIndex = -1;
    state.previewAutoFollow = true;
    state.subtitleVisible = true;
    buildPreviewList();
    if (source) {
      persistSubtitleUsage(source);
    }
    updateHideButtonLabel();
    updateCurrentSubtitleDisplay();
    setStatus(buildSuccessMessage(cues.length));
    renderSubtitle();
    return cues;
  }

  function requestSubtitleDownload(url) {
    return requestBackgroundMessage({
      type: "vso-download-subtitle",
      url
    }).then((response) => response.content);
  }

  async function loadSubtitleUrl(url, source = null, buildSuccessMessage = null, restoring = false) {
    const trimmedUrl = String(url || "").trim();

    if (!trimmedUrl) {
      throw new Error("请输入字幕链接");
    }

    const revision = ++subtitleLoadRevision;
    if (!restoring) state.pageMemoryRestored = true;
    setStatus("正在下载字幕...");
    const generation = activationGeneration;
    const content = await requestSubtitleDownload(trimmedUrl);
    if (!state.siteEnabled || generation !== activationGeneration || revision !== subtitleLoadRevision) return;
    const sourceName = getSubtitleFilenameFromUrl(trimmedUrl);
    const subtitleSource = source || buildSubtitleSource("remote", sourceName, trimmedUrl);

    return loadSubtitleContent(
      sourceName,
      content,
      subtitleSource,
      typeof buildSuccessMessage === "function"
        ? buildSuccessMessage
        : (cueCount) => `已加载在线字幕 ${sourceName}，共 ${cueCount} 条字幕`
    );
  }

  function adjustDelay(deltaMs) {
    state.settings.delayMs += deltaMs;
    syncControls();
    persistCurrentPageMemory();
    setStatus(`当前字幕偏移 ${formatDelayLabel(state.settings.delayMs)}`);
    renderSubtitle();
  }

  function resetSettings() {
    const wasKeepingRecords = shouldKeepRecords();
    state.settings = { ...DEFAULT_SETTINGS };
    state.timingRate = 1;
    state.calibrationAnchor = null;
    const { delayMs, ...sharedDefaults } = DEFAULT_SETTINGS;
    void saveSettings(sharedDefaults);
    syncControls();
    renderSubtitle();

    // 恢复默认会把隐私模式打开，如果之前是保留记录的状态，这里要跟着清掉。
    if (wasKeepingRecords) {
      applyKeepRecordsSetting(false);
      setStatus(
        `已恢复默认设置并开启不保留任何记录，已清空已有记录，当前字幕偏移 ${formatDelayLabel(state.settings.delayMs)}`
      );
      return;
    }

    persistCurrentPageMemory();
    setStatus(`当前字幕偏移 ${formatDelayLabel(state.settings.delayMs)}`);
  }

  button.addEventListener("click", () => togglePanel());

  listenActive(document, "pointerdown", (event) => {
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

  ui.searchButton.addEventListener("click", async () => {
    await searchSubtitleByKeyword(ui.searchInput.value);
  });

  ui.searchInput.addEventListener("input", () => {
    state.searchKeyword = ui.searchInput.value;
  });

  ui.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      ui.searchButton.click();
    }
  });

  ui.searchResults.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const languageButton = target.closest(".vso-language-button");
    if (languageButton instanceof HTMLButtonElement) {
      const detailUrl = languageButton.dataset.detailUrl || "";
      const downloadUrl = languageButton.dataset.downloadUrl || "";
      const option = getLanguageOptionByUrls(detailUrl, downloadUrl);
      if (option) {
        void downloadSearchResultLanguage(option);
      }
      return;
    }

    const resultItem = target.closest(".vso-search-item");
    if (!(resultItem instanceof HTMLElement)) {
      return;
    }

    const detailUrl = resultItem.dataset.detailUrl || "";
    if (!detailUrl) {
      return;
    }

    if (state.expandedResultUrl === detailUrl) {
      state.expandedResultUrl = "";
      state.languageLoadingUrl = "";
      renderSearchResults();
      return;
    }

    const result = getSearchResultByDetailUrl(detailUrl);
    if (result) {
      void expandSearchResult(result);
    }
  });

  ui.searchResults.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const resultItem = target.closest(".vso-search-item");
    if (!(resultItem instanceof HTMLElement)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const detailUrl = resultItem.dataset.detailUrl || "";
    if (!detailUrl) {
      return;
    }

    if (state.expandedResultUrl === detailUrl) {
      state.expandedResultUrl = "";
      state.languageLoadingUrl = "";
      renderSearchResults();
      return;
    }

    const result = getSearchResultByDetailUrl(detailUrl);
    if (result) {
      void expandSearchResult(result);
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
    void saveSettings({ textColor: state.settings.textColor });
  });

  ui.bgColor.addEventListener("input", () => {
    state.settings.backgroundColor = ui.bgColor.value;
    updateSubtitleStyles();
    void saveSettings({ backgroundColor: state.settings.backgroundColor });
  });

  ui.bgOpacity.addEventListener("input", () => {
    state.settings.backgroundOpacity = Number.parseFloat(ui.bgOpacity.value);
    ui.bgOpacityValue.textContent = `${Math.round(state.settings.backgroundOpacity * 100)}%`;
    updateSubtitleStyles();
    void saveSettings({ backgroundOpacity: state.settings.backgroundOpacity });
  });

  ui.fontSize.addEventListener("input", () => {
    state.settings.fontSize = Number.parseInt(ui.fontSize.value, 10);
    ui.fontSizeValue.textContent = `${state.settings.fontSize}px`;
    updateSubtitleStyles();
    void saveSettings({ fontSize: state.settings.fontSize });
    renderSubtitle();
  });

  ui.delayEarlierButton.addEventListener("click", () => {
    adjustDelay(-DELAY_STEP_MS);
  });

  ui.delayLaterButton.addEventListener("click", () => {
    adjustDelay(DELAY_STEP_MS);
  });

  ui.tabLoad.addEventListener("click", () => {
    setPanelTab("load");
  });

  ui.tabPreview.addEventListener("click", () => {
    setPanelTab("preview");
  });

  ui.tabLibrary.addEventListener("click", () => {
    setPanelTab("library");
  });

  ui.tabSettings.addEventListener("click", () => {
    setPanelTab("settings");
  });

  ui.fileToggleButton.addEventListener("click", () => {
    setLoadDisclosure("file");
  });

  ui.urlToggleButton.addEventListener("click", () => {
    setLoadDisclosure("url");
  });

  ui.clearSubtitleButton.addEventListener("click", () => {
    clearCurrentSubtitle();
  });

  ui.currentToggleVisibilityButton.addEventListener("click", () => {
    state.subtitleVisible = !state.subtitleVisible;
    updateHideButtonLabel();
    updateCurrentSubtitleDisplay();
    setStatus(state.subtitleVisible ? "字幕已显示" : "字幕已隐藏");
    renderSubtitle();
  });

  ui.previewResumeButton.addEventListener("click", () => {
    setPreviewAutoFollow(true);
    renderPreview(true);
  });

  ui.previewList.addEventListener("scroll", () => {
    if (!state.previewIgnoreScroll) setPreviewAutoFollow(false);
    renderPreview();
  });
  ui.previewList.addEventListener("wheel", () => setPreviewAutoFollow(false), { passive: true });
  ui.previewList.addEventListener("touchstart", () => setPreviewAutoFollow(false), { passive: true });

  ui.historyList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionButton = target.closest("[data-action]");
    const item = target.closest(".vso-library-item");
    if (!(actionButton instanceof HTMLElement) || !(item instanceof HTMLElement)) {
      return;
    }

    handleLibraryAction(
      item.dataset.listType || "history",
      item.dataset.entryId || "",
      actionButton.dataset.action || ""
    );
  });

  ui.favoritesList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionButton = target.closest("[data-action]");
    const item = target.closest(".vso-library-item");
    if (!(actionButton instanceof HTMLElement) || !(item instanceof HTMLElement)) {
      return;
    }

    handleLibraryAction(
      item.dataset.listType || "favorites",
      item.dataset.entryId || "",
      actionButton.dataset.action || ""
    );
  });

  ui.historyClearButton.addEventListener("click", () => {
    void mutateStorage({ action: "history.clear" });
    setStatus("已清空历史");
  });

  ui.favoritesClearButton.addEventListener("click", () => {
    void mutateStorage({ action: "favorites.clear" });
    setStatus("已清空收藏");
  });

  ui.pageMemoryClearButton.addEventListener("click", () => {
    clearCurrentPageMemory();
  });

  // 清空全部记录不可撤销，所以要点两次：第一次把按钮变成确认态，第二次才真清。
  let clearAllArmed = false;
  let clearAllTimer = 0;

  ui.recordsClearAllButton.addEventListener("click", () => {
    window.clearTimeout(clearAllTimer);

    if (!clearAllArmed) {
      clearAllArmed = true;
      ui.recordsClearAllButton.textContent = "再次点击确认清空";
      clearAllTimer = window.setTimeout(() => {
        clearAllArmed = false;
        ui.recordsClearAllButton.textContent = "清空全部记录";
      }, 4000);
      setStatus("点击「再次点击确认清空」以清掉全部记录");
      return;
    }

    clearAllArmed = false;
    ui.recordsClearAllButton.textContent = "清空全部记录";
    clearStoredRecords({ includeFavorites: true });
    setStatus("已清空全部记录");
  });

  ui.keepRecordsToggle.addEventListener("change", () => {
    applyKeepRecordsSetting(!ui.keepRecordsToggle.checked);
  });

  ui.hideButton.addEventListener("click", () => {
    state.subtitleVisible = !state.subtitleVisible;
    updateHideButtonLabel();
    setStatus(state.subtitleVisible ? "字幕已显示" : "字幕已隐藏");
    renderSubtitle();
  });

  ui.resetButton.addEventListener("click", resetSettings);

  listenActive(window, "scroll", (event) => {
    const target = event.target;
    if (target instanceof Node && panel.contains(target)) {
      return;
    }

    positionButton();
    renderSubtitle();
  }, true);

  listenActive(window, "resize", () => {
    positionButton();
    renderSubtitle();
  });

  listenActive(document, "fullscreenchange", () => {
    syncUiRoot();
    positionButton();
    renderSubtitle();
  });

  listenActive(document, "webkitfullscreenchange", () => {
    syncUiRoot();
    positionButton();
    renderSubtitle();
  });

  listenActive(document, "keydown", handleShortcut);

  const observer = new MutationObserver((mutations) => {
    if (!state.siteEnabled) return;
    let changed = false;
    for (const mutation of mutations) {
      if ([button, panel, subtitleLayer, toastLayer].some((node) => node === mutation.target || node.contains(mutation.target))) continue;
      mutation.addedNodes.forEach((node) => scanVideos(node));
      changed = true;
    }
    if (!changed) return;
    for (const video of state.videos) {
      if (!document.contains(video)) {
        unbindVideo(video);
        state.videos.delete(video);
        if (video === state.activeVideo) state.activeVideo = null;
      }
    }
    refreshActiveVideo();
  });

  updateSearchControls();
  renderSearchResults();
  renderLibrary();
  updateCurrentSubtitleDisplay();
  setLoadDisclosure("");
  setPanelTab("load");
  return { setEnabled: applySiteEnabled };
  }
})();
