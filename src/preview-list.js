(function attachPreviewList(globalObject) {
  const ROW_HEIGHT = 72;
  const OVERSCAN = 5;

  function createPreviewList(container, { onSelect, formatTime }) {
    let cues = [];
    const rows = new Map();
    const canvas = document.createElement("div");
    canvas.className = "vso-preview-canvas";

    container.addEventListener("click", (event) => {
      const row = event.target.closest("[data-cue-index]");
      if (row && container.contains(row)) onSelect(Number(row.dataset.cueIndex));
    });

    function setCues(nextCues) {
      cues = nextCues;
      rows.clear();
      canvas.replaceChildren();
      canvas.style.height = `${cues.length * ROW_HEIGHT}px`;
      container.replaceChildren(canvas);
      container.scrollTop = 0;
    }

    function scrollToIndex(index) {
      if (index < 0 || index >= cues.length) return;
      container.scrollTop = Math.max(0, index * ROW_HEIGHT - (container.clientHeight - ROW_HEIGHT) / 2);
    }

    function render(viewState, selectedIndex) {
      if (!canvas.isConnected) container.append(canvas);
      const start = Math.max(0, Math.floor(container.scrollTop / ROW_HEIGHT) - OVERSCAN);
      const end = Math.min(cues.length, Math.ceil((container.scrollTop + container.clientHeight) / ROW_HEIGHT) + OVERSCAN);
      for (const [index, row] of rows) {
        if (index < start || index >= end) { row.remove(); rows.delete(index); }
      }
      for (let index = start; index < end; index++) {
        let row = rows.get(index);
        if (!row) {
          row = document.createElement("button");
          row.type = "button";
          row.className = "vso-preview-item";
          row.dataset.cueIndex = String(index);
          row.style.top = `${index * ROW_HEIGHT}px`;
          row.title = cues[index].text;
          row.setAttribute("aria-label", `${formatTime(cues[index].start)} ${cues[index].text}`);
          const time = document.createElement("span");
          time.className = "vso-preview-time";
          time.textContent = formatTime(cues[index].start);
          const text = document.createElement("span");
          text.className = "vso-preview-text";
          text.textContent = cues[index].text;
          row.append(time, text);
          canvas.append(row);
          rows.set(index, row);
        }
        const active = index === viewState.activeCueIndex;
        const recent = index === viewState.recentCueIndex;
        const upcoming = index === viewState.upcomingCueIndex;
        const selected = index === selectedIndex;
        const signature = [active, recent, upcoming, selected, recent ? viewState.gapProgress : 0, upcoming ? viewState.upcomingWarmth : 0].join("|");
        if (row.dataset.view === signature) continue;
        row.dataset.view = signature;
        row.classList.toggle("vso-preview-item-active", active);
        row.classList.toggle("vso-preview-item-recent", recent);
        row.classList.toggle("vso-preview-item-upcoming", upcoming);
        row.classList.toggle("vso-preview-item-selected", selected);
        row.setAttribute("aria-pressed", String(selected));
        row.style.setProperty("--vso-gap-progress", recent ? String(viewState.gapProgress) : "0");
        row.style.setProperty("--vso-upcoming-warmth", upcoming ? String(viewState.upcomingWarmth) : "0");
      }
    }

    return { setCues, render, scrollToIndex };
  }
  globalObject.__VSO_PREVIEW__ = { createPreviewList };
})(globalThis);
