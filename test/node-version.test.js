import test from "node:test";
import assert from "node:assert/strict";
import { isSupportedNodeVersion, MIN_NODE_VERSION } from "../lib/node-version.js";

test("MIN_NODE_VERSION is the tested floor", () => {
  assert.equal(MIN_NODE_VERSION, "24.13.0");
});

test("isSupportedNodeVersion accepts the tested floor and newer", () => {
  assert.equal(isSupportedNodeVersion("24.13.0"), true);
  assert.equal(isSupportedNodeVersion("24.13.1"), true);
  assert.equal(isSupportedNodeVersion("24.14.0"), true);
  assert.equal(isSupportedNodeVersion("25.0.0"), true);
});

test("isSupportedNodeVersion rejects anything below 24.13.0", () => {
  assert.equal(isSupportedNodeVersion("24.12.0"), false);
  assert.equal(isSupportedNodeVersion("24.12.99"), false);
  assert.equal(isSupportedNodeVersion("23.11.0"), false);
  assert.equal(isSupportedNodeVersion("22.14.0"), false);
  assert.equal(isSupportedNodeVersion("22.5.0"), false);
});

test("assertNodeVersion accepts the current runtime", async () => {
  const { assertNodeVersion } = await import("../lib/node-version.js");
  assert.doesNotThrow(() => assertNodeVersion());
});
