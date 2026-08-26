export const MIN_NODE_VERSION = "24.13.0";

export function isSupportedNodeVersion(version = process.versions.node) {
  return compareNodeVersion(version, MIN_NODE_VERSION) >= 0;
}

export function assertNodeVersion() {
  if (isSupportedNodeVersion()) {
    return;
  }
  console.error(`Error: Node.js >= ${MIN_NODE_VERSION} is required (found ${process.versions.node}).`);
  console.error("cursor-migrate is tested on this Node version (built-in node:sqlite).");
  process.exit(1);
}

function compareNodeVersion(version, minimum) {
  const actual = parseVersion(version);
  const required = parseVersion(minimum);
  for (let i = 0; i < 3; i += 1) {
    if (actual[i] > required[i]) {
      return 1;
    }
    if (actual[i] < required[i]) {
      return -1;
    }
  }
  return 0;
}

function parseVersion(version) {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}
