import fs from "node:fs";
import path from "node:path";
import { encodeCursorProjectDir } from "./paths.js";

const MANIFEST_NAME = "manifest.json";

export function writeBackupManifest(backupDir, meta) {
  const payload = {
    version: 1,
    createdAt: new Date().toISOString(),
    ...meta,
  };
  fs.writeFileSync(path.join(backupDir, MANIFEST_NAME), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export function readBackupManifest(backupDir) {
  const manifestPath = path.join(backupDir, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function formatBackupLabel(meta) {
  if (meta?.from && meta?.to) {
    return `${meta.from} --> ${meta.to}`;
  }
  if (meta?.from) {
    return `${meta.from} --> (unknown destination)`;
  }
  return meta?.fallbackLabel ?? "(unknown migration)";
}

function listArtifactNames(backupDir) {
  return fs.readdirSync(backupDir).filter((name) => name !== MANIFEST_NAME);
}

export function inferLegacyBackupMeta(backupDir) {
  const artifacts = listArtifactNames(backupDir);
  const encodedFromProjectDir = artifacts.find(
    (name) => name !== "globalStorage-state.vscdb" && !name.startsWith("workspaceStorage-"),
  );
  const workspaceEntry = artifacts.find((name) => name.startsWith("workspaceStorage-"));
  const oldWorkspaceId = workspaceEntry?.slice("workspaceStorage-".length) ?? null;
  const from = encodedFromProjectDir ? decodeCursorProjectDir(encodedFromProjectDir) : null;

  return {
    version: 1,
    from,
    to: null,
    mode: "unknown",
    moveRepo: null,
    oldWorkspaceId,
    encodedFromProjectDir: encodedFromProjectDir ?? null,
    artifacts,
    fallbackLabel: `(legacy backup ${path.basename(backupDir)})`,
  };
}

export function decodeCursorProjectDir(encoded) {
  if (!encoded || process.platform === "win32") {
    return null;
  }
  return `/${encoded.replace(/-/g, "/")}`;
}

export function loadBackupEntry(backupDir) {
  const manifest = readBackupManifest(backupDir) ?? inferLegacyBackupMeta(backupDir);
  return {
    dir: backupDir,
    manifest,
    label: formatBackupLabel(manifest),
  };
}

export function listBackups(backupRoot) {
  if (!fs.existsSync(backupRoot)) {
    return [];
  }

  return fs
    .readdirSync(backupRoot)
    .filter((name) => name.startsWith("cursor-migrate-backup-"))
    .map((name) => path.join(backupRoot, name))
    .filter((dir) => fs.statSync(dir).isDirectory())
    .sort((a, b) => path.basename(b).localeCompare(path.basename(a)))
    .map((dir) => loadBackupEntry(dir));
}

export function buildBackupManifestMeta({
  fromPath,
  toPath,
  mode,
  moveRepo,
  oldWorkspaceId,
  artifacts,
}) {
  return {
    from: fromPath,
    to: toPath,
    mode,
    moveRepo,
    oldWorkspaceId,
    encodedFromProjectDir: encodeCursorProjectDir(fromPath),
    artifacts,
  };
}
