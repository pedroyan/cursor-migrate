export function assertNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 5)) {
    console.error(`Error: Node.js >= 22.5.0 is required (found ${process.versions.node}).`);
    console.error("cursor-migrate uses the built-in node:sqlite module.");
    process.exit(1);
  }
}
