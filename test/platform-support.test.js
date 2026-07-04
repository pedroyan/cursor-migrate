import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPlatformSupported,
  getUnsupportedPlatformMessage,
  GITHUB_REPO_URL,
} from "../lib/platform-support.js";

test("getUnsupportedPlatformMessage returns null for darwin and linux", () => {
  assert.equal(getUnsupportedPlatformMessage("darwin"), null);
  assert.equal(getUnsupportedPlatformMessage("linux"), null);
});

test("getUnsupportedPlatformMessage explains Windows is unsupported", () => {
  const message = getUnsupportedPlatformMessage("win32");
  assert.ok(message.includes("Windows is not currently supported"));
  assert.ok(message.includes("partial Windows support"));
  assert.ok(message.includes("never been tested"));
  assert.ok(message.includes(GITHUB_REPO_URL));
});

test("assertPlatformSupported accepts current runtime", () => {
  if (process.platform === "win32") {
    return;
  }
  assert.doesNotThrow(() => assertPlatformSupported());
});
