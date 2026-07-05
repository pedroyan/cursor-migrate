import test from "node:test";
import assert from "node:assert/strict";
import { ensureCursorClosed } from "../lib/ensure-cursor-closed.js";

function createDeps(overrides = {}) {
  const calls = { quit: 0, ask: 0, logs: [] };
  let running = true;
  return {
    calls,
    deps: {
      isCursorRunning: () => running,
      quitCursor: () => {
        calls.quit += 1;
        running = false;
        return { ok: true };
      },
      askYesNo: async () => {
        calls.ask += 1;
        return true;
      },
      log: (_step, message) => {
        calls.logs.push(message);
      },
      sleep: async () => {},
      isTTY: true,
      ...overrides,
    },
  };
}

test("ensureCursorClosed does nothing when Cursor is not running", async () => {
  const { calls, deps } = createDeps({ isCursorRunning: () => false });
  await ensureCursorClosed({}, deps);
  assert.equal(calls.quit, 0);
  assert.equal(calls.ask, 0);
});

test("ensureCursorClosed quits immediately when --quit-cursor is set", async () => {
  const { calls, deps } = createDeps();
  await ensureCursorClosed({ quitCursor: true }, deps);
  assert.equal(calls.quit, 1);
  assert.equal(calls.ask, 0);
  assert.ok(calls.logs.some((m) => m.includes("Quitting Cursor")));
});

test("ensureCursorClosed prompts and quits when user agrees", async () => {
  const { calls, deps } = createDeps({
    askYesNo: async () => {
      calls.ask += 1;
      return true;
    },
  });
  await ensureCursorClosed({}, deps);
  assert.equal(calls.ask, 1);
  assert.equal(calls.quit, 1);
});

test("ensureCursorClosed aborts when user declines to quit", async () => {
  const { calls, deps } = createDeps({
    askYesNo: async () => {
      calls.ask += 1;
      return false;
    },
  });
  await assert.rejects(
    () => ensureCursorClosed({}, deps),
    /Cursor is still running\. Quit it completely and rerun\./,
  );
  assert.equal(calls.ask, 1);
  assert.equal(calls.quit, 0);
});

test("ensureCursorClosed errors in non-interactive mode without --quit-cursor", async () => {
  const { calls, deps } = createDeps({ isTTY: false });
  await assert.rejects(
    () => ensureCursorClosed({}, deps),
    /--quit-cursor/,
  );
  assert.equal(calls.ask, 0);
  assert.equal(calls.quit, 0);
});

test("ensureCursorClosed warns and continues with --force", async () => {
  const { calls, deps } = createDeps();
  await ensureCursorClosed({ force: true }, deps);
  assert.equal(calls.quit, 0);
  assert.equal(calls.ask, 0);
  assert.ok(calls.logs.some((m) => m.includes("Warning: Cursor is running")));
});

test("ensureCursorClosed throws when quit command fails", async () => {
  const { deps } = createDeps({
    quitCursor: () => ({ ok: false, stderr: "permission denied" }),
  });
  await assert.rejects(
    () => ensureCursorClosed({ quitCursor: true }, deps),
    /Failed to quit Cursor \(permission denied\)/,
  );
});

test("ensureCursorClosed throws when Cursor remains running after quit", async () => {
  const { deps } = createDeps({
    quitCursor: () => ({ ok: true }),
  });
  await assert.rejects(
    () => ensureCursorClosed({ quitCursor: true }, deps),
    /Cursor is still running\. Close it manually and retry\./,
  );
});
