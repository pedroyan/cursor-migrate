import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDirectoryEmpty, validateDestinationForMove } from "../lib/dir-utils.js";

test("isDirectoryEmpty returns true for empty directories", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-dir-"));
  assert.equal(isDirectoryEmpty(dir), true);
});

test("isDirectoryEmpty returns false when directory has entries", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-dir-"));
  fs.writeFileSync(path.join(dir, "readme.txt"), "hello");
  assert.equal(isDirectoryEmpty(dir), false);
});

test("validateDestinationForMove allows missing paths", () => {
  const missing = path.join(os.tmpdir(), `cursor-migrate-missing-${Date.now()}`);
  assert.deepEqual(validateDestinationForMove(missing), { exists: false });
});

test("validateDestinationForMove allows empty directories", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-dir-"));
  assert.deepEqual(validateDestinationForMove(dir), { exists: true, empty: true });
});

test("validateDestinationForMove rejects non-empty directories", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-migrate-dir-"));
  fs.writeFileSync(path.join(dir, "file.txt"), "data");
  assert.throws(() => validateDestinationForMove(dir), /not empty/);
});

test("validateDestinationForMove rejects existing files", () => {
  const file = path.join(os.tmpdir(), `cursor-migrate-file-${Date.now()}`);
  fs.writeFileSync(file, "data");
  assert.throws(() => validateDestinationForMove(file), /not a directory/);
});
