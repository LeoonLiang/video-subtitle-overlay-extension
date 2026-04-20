(function attachVideoSubtitleOverlayHelpers(globalObject) {
  function getFullscreenElement(doc) {
    return (
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement ||
      null
    );
  }

  function resolveUiRoot(doc, activeVideo) {
    const fullscreenElement = getFullscreenElement(doc);

    if (
      fullscreenElement &&
      activeVideo &&
      typeof fullscreenElement.contains === "function" &&
      fullscreenElement.contains(activeVideo)
    ) {
      return fullscreenElement;
    }

    return doc.documentElement;
  }

  globalObject.__VSO_HELPERS__ = Object.assign(
    {},
    globalObject.__VSO_HELPERS__,
    {
      getFullscreenElement,
      resolveUiRoot
    }
  );
})(globalThis);
