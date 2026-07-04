import { spawnSync } from "node:child_process";

export function isCursorRunning() {
  if (process.platform === "win32") {
    const result = spawnSync("tasklist", [], { encoding: "utf8" });
    return /Cursor\.exe/i.test(result.stdout ?? "");
  }

  const result = spawnSync("pgrep", ["-x", "Cursor"], { encoding: "utf8" });
  return result.status === 0;
}

export function quitCursor() {
  if (process.platform === "darwin") {
    spawnSync("osascript", ["-e", 'tell application "Cursor" to quit'], { encoding: "utf8" });
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/IM", "Cursor.exe"], { encoding: "utf8" });
  }
}
