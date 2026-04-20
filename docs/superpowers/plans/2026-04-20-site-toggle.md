# Site Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hostname-based enable switch so the extension is off by default and can be toggled from the extension action context menu.

**Architecture:** Reuse shared helpers for hostname parsing and enabled-site map updates. Add a small background worker for the context menu and tab messaging, and keep the content script responsible for mounting or tearing down overlay UI based on the current hostname state.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript, Node test runner with `assert`

---

### Task 1: Shared site-toggle helpers

**Files:**
- Modify: `src/content-helpers.js`
- Test: `tests/site-toggle.test.mjs`

- [ ] Write the failing helper tests.
- [ ] Run `npm test` and verify the new helper assertions fail for missing exports.
- [ ] Implement hostname parsing and enabled-map toggle helpers in `src/content-helpers.js`.
- [ ] Run `npm test` and verify helper tests pass.

### Task 2: Background menu and messaging

**Files:**
- Create: `src/background.js`
- Modify: `src/manifest.json`
- Test: `tests/site-toggle.test.mjs`

- [ ] Extend tests for background-facing helper behavior.
- [ ] Run `npm test` and verify the new assertions fail.
- [ ] Add the background worker, menu setup, and runtime messaging.
- [ ] Update manifest permissions and background registration.
- [ ] Run `npm test` and verify tests pass.

### Task 3: Content-script gating

**Files:**
- Modify: `src/content.js`
- Test: `tests/site-toggle.test.mjs`

- [ ] Add a failing test for hostname enable-state behavior.
- [ ] Run `npm test` and verify failure.
- [ ] Gate overlay initialization behind the hostname-enabled check and react to toggle messages.
- [ ] Run `npm test` and verify all tests pass.

### Task 4: Docs refresh

**Files:**
- Modify: `README.md`

- [ ] Update usage docs to explain the new default-disabled behavior and right-click menu toggle.
- [ ] Run `npm test` once more to confirm the docs change did not accompany code regressions.
