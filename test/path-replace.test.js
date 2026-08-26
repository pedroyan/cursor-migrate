import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { replaceExactPath, toTildePath, replaceMigrationPaths } from "../lib/path-replace.js";

test("replaceExactPath does not rewrite a longer sibling folder name", () => {
  const from = "/Users/me/Project/hardscope/everest";
  const to = "/Users/me/Project/hardscope/quickscope-notes";
  const input = JSON.stringify({
    moved: from,
    sibling: `${from}-dashboard`,
    nested: `${from}/src/index.ts`,
  });

  const next = replaceExactPath(input, from, to);
  const data = JSON.parse(next);

  assert.equal(data.moved, to);
  assert.equal(data.sibling, "/Users/me/Project/hardscope/everest-dashboard");
  assert.equal(data.nested, `${to}/src/index.ts`);
});

test("replaceExactPath treats file URIs the same way", () => {
  const from = "file:///Users/me/Project/hardscope/everest";
  const to = "file:///Users/me/Project/hardscope/quickscope-notes";

  assert.equal(replaceExactPath(from, from, to), to);
  assert.equal(
    replaceExactPath(`${from}-dashboard`, from, to),
    "file:///Users/me/Project/hardscope/everest-dashboard",
  );
});

test("toTildePath rewrites a home-relative folder", () => {
  const abs = path.join(os.homedir(), "Project", "hardscope", "everest");
  assert.equal(toTildePath(abs), "~/Project/hardscope/everest");
});

test("replaceMigrationPaths remaps tilde display paths without touching sibling names", () => {
  const fromPath = path.join(os.homedir(), "Project", "hardscope", "everest");
  const toPath = path.join(os.homedir(), "Project", "hardscope", "quickscope-notes");
  const input = JSON.stringify({
    displayPath: "~/Project/hardscope/everest",
    sibling: "~/Project/hardscope/everest-dashboard",
    remote: "github.com/acme/everest",
  });

  const next = replaceMigrationPaths(input, {
    fromPath,
    toPath,
    fromUri: `file://${fromPath}`,
    toUri: `file://${toPath}`,
    oldWs: "oldws",
    newWs: "newws",
  });
  const data = JSON.parse(next);

  assert.equal(data.displayPath, "~/Project/hardscope/quickscope-notes");
  assert.equal(data.sibling, "~/Project/hardscope/everest-dashboard");
  assert.equal(data.remote, "github.com/acme/everest");
});
