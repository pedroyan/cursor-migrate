import fs from "node:fs";
import path from "node:path";
import { encodeCursorProjectDir, cursorProjectsRoot } from "./paths.js";

export function migrateCursorProjectDir(fromPath, toPath, { dryRun = false } = {}) {
  const root = cursorProjectsRoot();
  const oldName = encodeCursorProjectDir(fromPath);
  const newName = encodeCursorProjectDir(toPath);
  const oldDir = path.join(root, oldName);
  const newDir = path.join(root, newName);

  if (!fs.existsSync(oldDir)) {
    return { moved: false, reason: "missing", oldDir, newDir };
  }
  if (fs.existsSync(newDir)) {
    return { moved: false, reason: "destination-exists", oldDir, newDir };
  }

  if (!dryRun) {
    fs.mkdirSync(root, { recursive: true });
    fs.renameSync(oldDir, newDir);
  }

  return { moved: true, oldDir, newDir };
}

export function countAgentTranscripts(projectDir) {
  const dir = path.join(projectDir, "agent-transcripts");
  if (!fs.existsSync(dir)) {
    return 0;
  }

  let count = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        count += 1;
      }
    }
  }
  return count;
}
