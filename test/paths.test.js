import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import {
  encodeCursorProjectDir,
  resolvePath,
  toFileUri,
  normalizePathForMatch,
  setCursorUserDataDir,
  resetCursorUserDataDir,
  getConfiguredCursorUserDataDir,
  cursorUserDataRoot,
  workspaceStorageRoot,
  globalStorageDbPath,
  storageJsonPath,
  cursorProjectsRoot,
  createCursorPathOverrides,
  validateUserDataDir,
} from "../lib/paths.js";
import { computeWorkspaceIdCandidates, getFolderBirthtimeMs } from "../lib/workspace-id.js";

test("encodeCursorProjectDir converts absolute paths", () => {
  assert.equal(
    encodeCursorProjectDir("/Users/pedro/Project/Personal/ledger-app"),
    "Users-pedro-Project-Personal-ledger-app",
  );
});

test("resolvePath expands home directories", () => {
  const resolved = resolvePath("~/Project/demo");
  assert.match(resolved, /\/Project\/demo$/);
});

test("toFileUri produces a file URI for absolute paths", () => {
  const uri = toFileUri("/tmp/example");
  assert.match(uri, /^file:\/\//);
  assert.ok(uri.includes("tmp"));
  assert.ok(uri.includes("example"));
});

test("normalizePathForMatch resolves file URIs to paths", () => {
  const abs = "/tmp/normalize-test";
  assert.equal(normalizePathForMatch(`file://${abs}`), abs);
});

test("computeWorkspaceIdCandidates returns unique ids", () => {
  const candidates = computeWorkspaceIdCandidates("/tmp/example", 1000);
  assert.equal(candidates.length, 7);
  assert.equal(new Set(candidates.map((c) => c.id)).size, 7);
});

test("getFolderBirthtimeMs reads a real directory", () => {
  const ms = getFolderBirthtimeMs(".");
  assert.equal(typeof ms, "number");
  assert.ok(ms > 0);
});

test("assertNodeVersion accepts current runtime", async () => {
  const { assertNodeVersion } = await import("../lib/node-version.js");
  assert.doesNotThrow(() => assertNodeVersion());
});

test("setCursorUserDataDir routes storage paths to a custom profile", () => {
  resetCursorUserDataDir();
  const custom = path.join(os.tmpdir(), "cursor-migrate-custom-profile");

  setCursorUserDataDir(custom);
  try {
    assert.equal(getConfiguredCursorUserDataDir(), path.resolve(custom));
    assert.equal(cursorUserDataRoot(), path.resolve(custom));
    assert.equal(workspaceStorageRoot(), path.join(path.resolve(custom), "User", "workspaceStorage"));
    assert.equal(globalStorageDbPath(), path.join(path.resolve(custom), "User", "globalStorage", "state.vscdb"));
    assert.equal(storageJsonPath(), path.join(path.resolve(custom), "User", "globalStorage", "storage.json"));
    assert.equal(cursorProjectsRoot(), path.join(os.homedir(), ".cursor", "projects"));
  } finally {
    resetCursorUserDataDir();
  }
});

test("resetCursorUserDataDir restores default Cursor locations", () => {
  resetCursorUserDataDir();
  const defaultRoot = cursorUserDataRoot();
  setCursorUserDataDir(path.join(os.tmpdir(), "cursor-migrate-reset-test"));
  resetCursorUserDataDir();

  assert.equal(getConfiguredCursorUserDataDir(), null);
  assert.equal(cursorUserDataRoot(), defaultRoot);
});

test("createCursorPathOverrides returns empty object for default profile", () => {
  assert.deepEqual(createCursorPathOverrides(null), {});
  assert.deepEqual(createCursorPathOverrides(undefined), {});
});

test("createCursorPathOverrides maps custom user data dir paths", () => {
  const custom = "/tmp/my-cursor-profile";
  const overrides = createCursorPathOverrides(custom);

  assert.equal(overrides.globalStorageDbPath(), path.join(custom, "User", "globalStorage", "state.vscdb"));
  assert.equal(overrides.workspaceStorageRoot(), path.join(custom, "User", "workspaceStorage"));
});

test("validateUserDataDir rejects missing directories", () => {
  assert.throws(
    () => validateUserDataDir(path.join(os.tmpdir(), "cursor-migrate-missing-profile")),
    /does not exist/,
  );
});
