import assert from "assert";
import "../src/content-helpers.js";

const helpers = globalThis.__VSO_HELPERS__ || {};
const {
  getSiteHostname,
  isSiteEnabled,
  setSiteEnabled,
  supportsDynamicMenuTitle,
  shouldIgnoreMissingMenuError
} = helpers;

assert.ok(getSiteHostname, "getSiteHostname should be defined");
assert.ok(isSiteEnabled, "isSiteEnabled should be defined");
assert.ok(setSiteEnabled, "setSiteEnabled should be defined");
assert.ok(supportsDynamicMenuTitle, "supportsDynamicMenuTitle should be defined");
assert.ok(shouldIgnoreMissingMenuError, "shouldIgnoreMissingMenuError should be defined");

assert.strictEqual(
  getSiteHostname("https://www.youtube.com/watch?v=1"),
  "www.youtube.com",
  "should extract hostname from absolute URLs"
);

assert.strictEqual(
  getSiteHostname("chrome://extensions"),
  "",
  "should return an empty hostname for unsupported extension pages"
);

assert.strictEqual(
  isSiteEnabled({ "www.youtube.com": true }, "https://www.youtube.com/watch?v=1"),
  true,
  "should detect enabled hostnames"
);

assert.strictEqual(
  isSiteEnabled({ "www.youtube.com": true }, "https://v.qq.com/x/cover"),
  false,
  "should default to disabled when hostname is absent"
);

assert.deepStrictEqual(
  setSiteEnabled({}, "https://www.youtube.com/watch?v=1", true),
  { "www.youtube.com": true },
  "should store enabled hostnames"
);

assert.deepStrictEqual(
  setSiteEnabled({ "www.youtube.com": true }, "https://www.youtube.com/watch?v=1", false),
  {},
  "should remove hostnames when disabled"
);

assert.strictEqual(
  supportsDynamicMenuTitle({
    onShown: {
      addListener() {}
    },
    refresh() {}
  }),
  true,
  "should enable dynamic menu title updates when context menu APIs exist"
);

assert.strictEqual(
  supportsDynamicMenuTitle({}),
  false,
  "should disable dynamic menu title updates when onShown is unavailable"
);

assert.strictEqual(
  shouldIgnoreMissingMenuError("Cannot find menu item with id vso-toggle-current-site"),
  true,
  "should ignore missing menu item errors during menu bootstrap"
);

assert.strictEqual(
  shouldIgnoreMissingMenuError("Some other runtime error"),
  false,
  "should not ignore unrelated runtime errors"
);

console.log("site-toggle tests passed");
