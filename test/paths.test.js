import test from "node:test";
import assert from "node:assert/strict";
import { encodeCursorProjectDir, resolvePath } from "../lib/paths.js";
import { computeWorkspaceIdCandidates, getFolderBirthtimeMs } from "../lib/workspace-id.js";

test("encodeCursorProjectDir converts absolute paths", () => {
  assert.equal(
    encodeCursorProjectDir("/Users/pedro/Project/Fintropya/MarkBlog"),
    "Users-pedro-Project-Fintropya-MarkBlog",
  );
});

test("resolvePath expands home directories", () => {
  const resolved = resolvePath("~/Project/demo");
  assert.match(resolved, /\/Project\/demo$/);
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
