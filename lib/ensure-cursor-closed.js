import { isCursorRunning, quitCursor } from "./cursor-process.js";
import { askYesNo } from "./prompt.js";

function defaultLog(step, message) {
  console.log(`[cursor-migrate] ${step}: ${message}`);
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const QUIT_POLL_INTERVAL_MS = 1000;
const QUIT_POLL_MAX_ATTEMPTS = 10;

async function attemptQuitCursor(deps) {
  const { quitCursor: quit, isCursorRunning: checkRunning, log, sleep } = deps;
  if (!checkRunning()) {
    return;
  }
  log("cursor", "Quitting Cursor...");
  const result = quit();
  if (!result.ok && checkRunning()) {
    const detail = result.stderr ? ` (${result.stderr})` : "";
    throw new Error(`Failed to quit Cursor${detail}. Close it manually and retry.`);
  }
  if (!checkRunning()) {
    return;
  }
  for (let attempt = 0; attempt < QUIT_POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(QUIT_POLL_INTERVAL_MS);
    if (!checkRunning()) {
      return;
    }
  }
  throw new Error("Cursor is still running. Close it manually and retry.");
}

export async function ensureCursorClosed(options, deps = {}) {
  const {
    isCursorRunning: checkRunning = isCursorRunning,
    quitCursor: quit = quitCursor,
    askYesNo: ask = askYesNo,
    log = defaultLog,
    sleep = defaultSleep,
    isTTY = process.stdin.isTTY,
  } = deps;

  if (!checkRunning()) {
    return;
  }

  if (options.force) {
    log("cursor", "Warning: Cursor is running — migration may be reverted on next launch");
    return;
  }

  if (options.quitCursor) {
    await attemptQuitCursor({ quitCursor: quit, isCursorRunning: checkRunning, log, sleep });
    return;
  }

  if (!isTTY) {
    throw new Error(
      "Cursor is running — quit it completely before migrating, or rerun with --quit-cursor. " +
        "Migration while Cursor is open can undo composer index changes.",
    );
  }

  const shouldQuit = await ask(
    "Cursor is running. Migration requires Cursor to be quit. Quit Cursor now?",
  );
  if (!shouldQuit) {
    throw new Error("Cursor is still running. Quit it completely and rerun.");
  }

  await attemptQuitCursor({ quitCursor: quit, isCursorRunning: checkRunning, log, sleep });
}
