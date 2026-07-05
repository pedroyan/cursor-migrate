import test from "node:test";
import assert from "node:assert/strict";
import { formatSelectLine } from "../lib/terminal-select.js";

test("formatSelectLine highlights the active row when color is enabled", () => {
  const selected = formatSelectLine("alpha --> beta", true, true);
  const normal = formatSelectLine("alpha --> beta", false, true);

  assert.match(selected, /> alpha --> beta/);
  assert.match(selected, /\x1b\[/);
  assert.equal(normal, "  alpha --> beta");
});

test("formatSelectLine uses a prefix when color is disabled", () => {
  assert.equal(formatSelectLine("item", true, false), "> item");
  assert.equal(formatSelectLine("item", false, false), "  item");
});
