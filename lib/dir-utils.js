import fs from "node:fs";

export function isDirectoryEmpty(absPath) {
  return fs.readdirSync(absPath).length === 0;
}

/**
 * @returns {{ exists: false } | { exists: true, empty: true }}
 */
export function validateDestinationForMove(toPath) {
  if (!fs.existsSync(toPath)) {
    return { exists: false };
  }

  const stat = fs.statSync(toPath);
  if (!stat.isDirectory()) {
    throw new Error(
      `Destination already exists but is not a directory: ${toPath}\n` +
        "Pick a --to path that does not exist yet, or an empty folder to receive the project.",
    );
  }

  if (isDirectoryEmpty(toPath)) {
    return { exists: true, empty: true };
  }

  throw new Error(
    `Destination already exists and is not empty: ${toPath}\n` +
      "cursor-migrate needs either a path that does not exist yet, or an empty folder to move the project into. " +
      "Remove or relocate the existing files first, or choose a different --to path.",
  );
}
