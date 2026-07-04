import crypto from "node:crypto";
import fs from "node:fs";

function hashWorkspace(fsPath, salt) {
  return crypto.createHash("md5").update(fsPath).update(String(salt)).digest("hex");
}

export function getFolderBirthtimeMs(absPath) {
  const stat = fs.statSync(absPath);
  if (process.platform === "linux") {
    return stat.ino;
  }
  if (process.platform === "win32" && typeof stat.birthtimeMs === "number") {
    return Math.floor(stat.birthtimeMs);
  }
  return Math.floor(stat.birthtime.getTime());
}

export function computeWorkspaceIdCandidates(absPath, birthtimeMs = getFolderBirthtimeMs(absPath)) {
  const candidates = [];
  const seen = new Set();
  for (let delta = -3; delta <= 3; delta += 1) {
    const id = hashWorkspace(absPath, birthtimeMs + delta);
    if (!seen.has(id)) {
      seen.add(id);
      candidates.push({ id, birthtimeMs: birthtimeMs + delta, delta });
    }
  }
  return candidates;
}

export function pickWorkspaceId(absPath, preferredId) {
  if (preferredId) {
    return preferredId;
  }
  const candidates = computeWorkspaceIdCandidates(absPath);
  const nonZero = candidates.find((c) => c.delta === 1);
  if (process.platform === "darwin" && nonZero) {
    return nonZero.id;
  }
  return candidates.find((c) => c.delta === 0)?.id ?? candidates[0].id;
}
