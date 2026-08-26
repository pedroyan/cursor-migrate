import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  findWorkspaceStorageIdsForFolder,
  findActiveWorkspaceStorageId,
} from "../lib/discover.js";
import { pickWorkspaceId, pickWorkspaceIdMirrorTargets } from "../lib/workspace-id.js";
import { toFileUri } from "../lib/paths.js";

function createWorkspaceEntry(root, id, folderPath, { dbSize = 1024, mtimeMs = Date.now() } = {}) {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), `${JSON.stringify({ folder: toFileUri(folderPath) })}\n`);
  const dbPath = path.join(dir, "state.vscdb");
  fs.writeFileSync(dbPath, "x".repeat(dbSize));
  fs.utimesSync(dbPath, mtimeMs / 1000, mtimeMs / 1000);
}

test("findWorkspaceStorageIdsForFolder matches exact paths only", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-discover-"));
  const target = path.join(root, "proj", "foo");
  const similar = path.join(root, "my", "proj", "foo");

  createWorkspaceEntry(root, "ws-target", target, { dbSize: 5000 });
  createWorkspaceEntry(root, "ws-similar", similar, { dbSize: 9000 });

  const matches = findWorkspaceStorageIdsForFolder(target, toFileUri(target), { workspaceRoot: root });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "ws-target");
});

test("findWorkspaceStorageIdsForFolder returns multiple matches sorted by size", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-discover-"));
  const target = path.join(root, "project");

  createWorkspaceEntry(root, "ws-small", target, { dbSize: 4096 });
  createWorkspaceEntry(root, "ws-large", target, { dbSize: 1_500_000 });

  const matches = findWorkspaceStorageIdsForFolder(target, toFileUri(target), { workspaceRoot: root });
  assert.equal(matches.length, 2);
  assert.equal(matches[0].id, "ws-large");
  assert.equal(matches[1].id, "ws-small");
});

test("findActiveWorkspaceStorageId prefers recently modified small db", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-discover-"));
  const target = path.join(root, "project");
  const now = Date.now();

  createWorkspaceEntry(root, "ws-large-old", target, { dbSize: 1_500_000, mtimeMs: now - 120_000 });
  createWorkspaceEntry(root, "ws-live", target, { dbSize: 4096, mtimeMs: now - 5_000 });

  const activeId = findActiveWorkspaceStorageId(target, toFileUri(target), { workspaceRoot: root });
  assert.equal(activeId, "ws-live");
});

test("findActiveWorkspaceStorageId prefers birthtime delta 0 among clustered dest mirrors", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-discover-"));
  const target = path.join(tmp, "quickscope-notes");
  const workspaceRoot = path.join(tmp, "ws");
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const delta0 = pickWorkspaceId(target);
  const mirrors = pickWorkspaceIdMirrorTargets(target);
  const now = Date.now();
  for (const [index, id] of mirrors.entries()) {
    createWorkspaceEntry(workspaceRoot, id, target, { dbSize: 307_200, mtimeMs: now + index * 10 });
  }

  const activeId = findActiveWorkspaceStorageId(target, toFileUri(target), { workspaceRoot });
  assert.equal(activeId, delta0);
});

test("findActiveWorkspaceStorageId prefers the dest id Cursor wrote after open", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-discover-"));
  const target = path.join(tmp, "quickscope-notes");
  const workspaceRoot = path.join(tmp, "ws");
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const delta0 = pickWorkspaceId(target);
  const plus1 = pickWorkspaceIdMirrorTargets(target).find((id) => id !== delta0);
  const now = Date.now();
  createWorkspaceEntry(workspaceRoot, delta0, target, { dbSize: 307_200, mtimeMs: now - 60_000 });
  createWorkspaceEntry(workspaceRoot, plus1, target, { dbSize: 4096, mtimeMs: now });

  const activeId = findActiveWorkspaceStorageId(target, toFileUri(target), { workspaceRoot });
  assert.equal(activeId, plus1);
});
