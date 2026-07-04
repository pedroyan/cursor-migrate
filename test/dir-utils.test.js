import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrateProject } from "../lib/migrate.js";
import { isDirectoryEmpty, validateDestinationForMove } from "../lib/dir-utils.js";

test("validateDestinationForMove allows no folder or empty folder only", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-dest-"));
  const missing = path.join(root, "new-project");
  const empty = path.join(root, "empty-project");
  const occupied = path.join(root, "occupied-project");

  fs.mkdirSync(empty);
  fs.mkdirSync(occupied);
  fs.writeFileSync(path.join(occupied, "file.txt"), "data");

  assert.deepEqual(validateDestinationForMove(missing), { exists: false });
  assert.deepEqual(validateDestinationForMove(empty), { exists: true, empty: true });

  assert.throws(
    () => validateDestinationForMove(occupied),
    (error) => {
      assert.match(error.message, /Destination already exists and is not empty/);
      assert.ok(error.message.includes(occupied));
      assert.match(error.message, /empty folder to move the project into/);
      return true;
    },
  );
});

test("migrateProject rejects a non-empty destination before migrating", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-migrate-"));
  const fromPath = path.join(root, "origin");
  const toPath = path.join(root, "destination");

  fs.mkdirSync(fromPath);
  fs.mkdirSync(toPath);
  fs.writeFileSync(path.join(fromPath, ".keep"), "");
  fs.writeFileSync(path.join(toPath, "existing.txt"), "occupied");

  await assert.rejects(
    () =>
      migrateProject({
        from: fromPath,
        to: toPath,
        dryRun: true,
        skipBackup: true,
      }),
    (error) => {
      assert.match(error.message, /Destination already exists and is not empty/);
      assert.ok(error.message.includes(toPath));
      return true;
    },
  );
});

test("isDirectoryEmpty returns true for empty directories", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-dir-"));
  assert.equal(isDirectoryEmpty(dir), true);
});

test("isDirectoryEmpty returns false when directory has entries", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-dir-"));
  fs.writeFileSync(path.join(dir, "readme.txt"), "hello");
  assert.equal(isDirectoryEmpty(dir), false);
});

test("validateDestinationForMove rejects existing files", () => {
  const file = path.join(os.tmpdir(), `cursor-migrate-file-${Date.now()}`);
  fs.writeFileSync(file, "data");
  assert.throws(() => validateDestinationForMove(file), /not a directory/);
});
