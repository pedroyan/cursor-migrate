import { spawnSync } from "node:child_process";

/** @param {{ status?: number | null; stdout?: string | null }} result */
export function parseCursorRunningResult(platform, result) {
  if (platform === "win32") {
    return /Cursor\.exe/i.test(result.stdout ?? "");
  }
  if (platform === "darwin") {
    return result.stdout?.trim() === "true";
  }
  return result.status === 0;
}

function runCursorRunningCheck() {
  if (process.platform === "win32") {
    return spawnSync("tasklist", [], { encoding: "utf8" });
  }
  if (process.platform === "darwin") {
    // Main process comm is the full path, not "Cursor" — pgrep -x Cursor misses it.
    return spawnSync("osascript", ["-e", 'application "Cursor" is running'], { encoding: "utf8" });
  }
  return spawnSync("pgrep", ["-f", "[Cc]ursor"], { encoding: "utf8" });
}

export function isCursorRunning() {
  const result = runCursorRunningCheck();
  return parseCursorRunningResult(process.platform, result);
}

/** @returns {{ ok: boolean, status: number | null, stderr: string }} */
export function quitCursor() {
  let result;
  if (process.platform === "darwin") {
    result = spawnSync("osascript", ["-e", 'tell application "Cursor" to quit'], { encoding: "utf8" });
  } else if (process.platform === "win32") {
    result = spawnSync("taskkill", ["/IM", "Cursor.exe"], { encoding: "utf8" });
  } else {
    result = spawnSync("pkill", ["-f", "[Cc]ursor"], { encoding: "utf8" });
  }
  const status = result.status ?? null;
  const stderr = (result.stderr ?? "").trim();
  const ok = status === 0;
  return { ok, status, stderr };
}
