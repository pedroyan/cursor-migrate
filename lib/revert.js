import fs from "node:fs";
import path from "node:path";
import { loadBackupEntry, listBackups } from "./backup-manifest.js";
import { ensureCursorClosed } from "./ensure-cursor-closed.js";
import {
  cursorMigrateBackupRoot,
  cursorProjectsRoot,
  encodeCursorProjectDir,
  globalStorageDbPath,
  workspaceStorageRoot,
  createCursorPathOverrides,
  validateUserDataDir,
} from "./paths.js";
import { selectFromList } from "./terminal-select.js";

function log(step, message) {
  console.log(`[cursor-migrate] ${step}: ${message}`);
}

function restoreTree(src, dest) {
  if (!fs.existsSync(src)) {
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
  return true;
}

function moveRepoBack(fromPath, toPath) {
  if (!fromPath || !toPath) {
    return false;
  }
  if (fs.existsSync(fromPath) || !fs.existsSync(toPath)) {
    return false;
  }

  fs.mkdirSync(path.dirname(fromPath), { recursive: true });
  try {
    fs.renameSync(toPath, fromPath);
    return true;
  } catch (error) {
    if (error?.code !== "EXDEV") {
      throw error;
    }
    fs.cpSync(toPath, fromPath, { recursive: true, force: true, preserveTimestamps: true });
    fs.rmSync(toPath, { recursive: true, force: true });
    return true;
  }
}

function removeCursorProjectDir(projectPath) {
  if (!projectPath || !fs.existsSync(projectPath)) {
    return false;
  }
  fs.rmSync(projectPath, { recursive: true, force: true });
  return true;
}

export function applyRevert({ backupDir, manifest, dryRun = false, paths = {} }) {
  const globalPath = paths.globalStorageDbPath?.() ?? globalStorageDbPath();
  const workspaceRoot = paths.workspaceStorageRoot?.() ?? workspaceStorageRoot();
  const projectsRoot = paths.cursorProjectsRoot?.() ?? cursorProjectsRoot();
  const restored = [];
  const actions = [];

  for (const artifact of manifest.artifacts ?? []) {
    if (artifact === "globalStorage-state.vscdb") {
      actions.push(`restore global composer index -> ${globalPath}`);
      if (!dryRun) {
        if (restoreTree(path.join(backupDir, artifact), globalPath)) {
          restored.push(artifact);
        }
      }
      continue;
    }

    if (artifact.startsWith("workspaceStorage-")) {
      const workspaceId = artifact.slice("workspaceStorage-".length);
      const dest = path.join(workspaceRoot, workspaceId);
      actions.push(`restore workspace storage ${workspaceId}`);
      if (!dryRun) {
        if (restoreTree(path.join(backupDir, artifact), dest)) {
          restored.push(artifact);
        }
      }
      continue;
    }

    const dest = path.join(projectsRoot, artifact);
    actions.push(`restore ~/.cursor/projects/${artifact}`);
    if (!dryRun) {
      if (restoreTree(path.join(backupDir, artifact), dest)) {
        restored.push(artifact);
      }
    }
  }

  if (manifest.moveRepo && manifest.from && manifest.to) {
    if (dryRun) {
      actions.push(`would move repo ${manifest.to} -> ${manifest.from}`);
    } else {
      const moved = moveRepoBack(manifest.from, manifest.to);
      if (moved) {
        actions.push(`moved repo back to ${manifest.from}`);
      } else {
        let reason = "repo move skipped";
        if (fs.existsSync(manifest.from)) {
          reason = "origin already exists";
        } else if (!fs.existsSync(manifest.to)) {
          reason = "destination missing";
        }
        actions.push(`skipped repo move (${reason})`);
      }
    }
  }

  if (manifest.from && manifest.to && manifest.mode === "migrate") {
    const oldProjectDir = path.join(projectsRoot, encodeCursorProjectDir(manifest.from));
    const newProjectDir = path.join(projectsRoot, encodeCursorProjectDir(manifest.to));
    if (newProjectDir !== oldProjectDir) {
      actions.push(`remove migrated ~/.cursor/projects entry for ${manifest.to}`);
      if (!dryRun) {
        removeCursorProjectDir(newProjectDir);
      }
    }
  }

  return { restored, actions, dryRun };
}

export async function revertFromBackup(options = {}) {
  const backupRoot = options.backupRoot ?? cursorMigrateBackupRoot();
  const entries = listBackups(backupRoot);

  if (entries.length === 0) {
    throw new Error(`No backups found in ${backupRoot}`);
  }

  log("revert", `Found ${entries.length} backup(s) in ${backupRoot}`);
  const index = await selectFromList(
    entries.map((entry) => entry.label),
    { title: "Select a migration to revert:" },
  );
  const selected = entries[index];
  const dryRun = Boolean(options.dryRun);

  await ensureCursorClosed(options, { log });

  log("revert", dryRun ? `Would revert ${selected.label}` : `Reverting ${selected.label}`);
  log("revert", `Backup: ${selected.dir}`);

  const userDataDir = options.userDataDir ?? selected.manifest.userDataDir ?? null;
  if (options.userDataDir) {
    validateUserDataDir(options.userDataDir);
  } else if (userDataDir) {
    validateUserDataDir(userDataDir);
  }
  const pathOverrides = createCursorPathOverrides(userDataDir);

  const result = applyRevert({
    backupDir: selected.dir,
    manifest: selected.manifest,
    dryRun,
    paths: pathOverrides,
  });

  for (const action of result.actions) {
    log("revert", dryRun ? `Would ${action}` : action);
  }

  if (!dryRun) {
    log(
      "revert",
      `Restored ${result.restored.length} artifact(s). Reopen the project from ${selected.manifest.from ?? "its original path"}.`,
    );
  }

  return { ...result, selected: loadBackupEntry(selected.dir) };
}
