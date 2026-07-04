import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { isCursorRunning, parseCursorRunningResult } from "../lib/cursor-process.js";

test("parseCursorRunningResult detects Cursor on darwin via osascript", () => {
  assert.equal(parseCursorRunningResult("darwin", { stdout: "true\n" }), true);
  assert.equal(parseCursorRunningResult("darwin", { stdout: "false\n" }), false);
});

test("parseCursorRunningResult detects Cursor.exe on win32", () => {
  assert.equal(parseCursorRunningResult("win32", { stdout: "Cursor.exe  1234 Console\n" }), true);
  assert.equal(parseCursorRunningResult("win32", { stdout: "notepad.exe\n" }), false);
});

test("parseCursorRunningResult uses pgrep exit status on linux", () => {
  assert.equal(parseCursorRunningResult("linux", { status: 0 }), true);
  assert.equal(parseCursorRunningResult("linux", { status: 1 }), false);
});

test("isCursorRunning matches osascript on darwin", { skip: process.platform !== "darwin" }, () => {
  const osa = spawnSync("osascript", ["-e", 'application "Cursor" is running'], { encoding: "utf8" });
  const expected = osa.stdout?.trim() === "true";
  assert.equal(isCursorRunning(), expected);
});
