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

/** Primary workspace id Cursor is most likely to use (delta 0). */
export function pickWorkspaceId(absPath, preferredId) {
  if (preferredId) {
    return preferredId;
  }
  const candidates = computeWorkspaceIdCandidates(absPath);
  return candidates.find((c) => c.delta === 0)?.id ?? candidates[0].id;
}

/** Neighbor ids to mirror workspace data (-1, 0, +1 ms birthtime). */
export function pickWorkspaceIdMirrorTargets(absPath) {
  const candidates = computeWorkspaceIdCandidates(absPath);
  return candidates
    .filter((c) => Math.abs(c.delta) <= 1)
    .map((c) => c.id);
}
