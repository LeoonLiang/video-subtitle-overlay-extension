import assert from "assert";
import "../src/content-helpers.js";

const { resolveUiRoot } = globalThis.__VSO_HELPERS__ || {};

function createNode(name) {
  return {
    name,
    children: [],
    append(...nodes) {
      this.children.push(...nodes);
    },
    contains(target) {
      if (target === this) {
        return true;
      }
      return this.children.some((child) => {
        if (child === target) {
          return true;
        }
        return typeof child.contains === "function" ? child.contains(target) : false;
      });
    }
  };
}

assert.ok(resolveUiRoot, "resolveUiRoot should be defined");

{
  const docRoot = createNode("documentElement");
  const fullscreenRoot = createNode("fullscreenRoot");
  const video = createNode("video");
  fullscreenRoot.append(video);
  const mockDocument = {
    documentElement: docRoot,
    fullscreenElement: fullscreenRoot
  };

  assert.strictEqual(
    resolveUiRoot(mockDocument, video),
    fullscreenRoot,
    "UI should move into the fullscreen container when the active video is inside it"
  );
}

{
  const docRoot = createNode("documentElement");
  const fullscreenRoot = createNode("fullscreenRoot");
  const video = createNode("video");
  const mockDocument = {
    documentElement: docRoot,
    fullscreenElement: fullscreenRoot
  };

  assert.strictEqual(
    resolveUiRoot(mockDocument, video),
    docRoot,
    "UI should stay on the document root when fullscreen does not belong to the active video"
  );
}

console.log("fullscreen-ui-root tests passed");
