# Site Toggle Design

## Goal

Make the extension disabled by default on every website, and let the user enable or disable it per hostname from the extension icon's right-click menu.

## Design

- Add a background service worker to own the action context menu and site-toggle storage updates.
- Store enabled sites in `chrome.storage.local` as a hostname-keyed map so `www.youtube.com` and `v.qq.com` are independent.
- Keep content scripts on all pages, but gate UI initialization behind the current hostname being enabled.
- When the user toggles the current site from the context menu, the background script updates storage and sends a runtime message so the current tab applies the new state immediately without reload.

## Behavior

- Default state: disabled on all hostnames unless explicitly enabled.
- Menu title changes based on current tab hostname: enable when disabled, disable when enabled.
- If disabled, the content script should not show the button, panel, or subtitle layer.
- Existing subtitle style settings remain unchanged and continue using `chrome.storage.local`.

## Files

- Modify `src/manifest.json` to add background worker and required permissions.
- Modify `src/content-helpers.js` to expose hostname and enabled-site helper functions.
- Modify `src/content.js` to gate initialization and react to toggle messages.
- Add `src/background.js` for context menu behavior and site state updates.
- Add tests covering hostname normalization and storage-map toggling behavior.
