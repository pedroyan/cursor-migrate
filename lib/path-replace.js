import os from "node:os";

function isPathNameContinuation(char) {
  return /[A-Za-z0-9._-]/.test(char);
}

/** Replace `from` only when it is a complete path segment, not a prefix of a longer name. */
export function replaceExactPath(text, from, to) {
  if (!from || from === to || typeof text !== "string") {
    return text;
  }

  let result = "";
  let index = 0;
  while (index < text.length) {
    const found = text.indexOf(from, index);
    if (found === -1) {
      result += text.slice(index);
      break;
    }

    result += text.slice(index, found);
    const after = text[found + from.length];
    if (after === undefined || !isPathNameContinuation(after)) {
      result += to;
    } else {
      result += from;
    }
    index = found + from.length;
  }
  return result;
}

export function toTildePath(absPath) {
  if (!absPath) {
    return null;
  }

  const home = os.homedir().replaceAll("\\", "/");
  const normalized = absPath.replaceAll("\\", "/");
  if (normalized === home) {
    return "~";
  }
  if (normalized.startsWith(`${home}/`)) {
    return `~${normalized.slice(home.length)}`;
  }
  return null;
}

export function replaceMigrationPaths(text, migration) {
  if (typeof text !== "string") {
    return text;
  }

  let next = replaceExactPath(text, migration.fromPath, migration.toPath);
  next = replaceExactPath(next, migration.fromUri, migration.toUri);

  const fromTilde = toTildePath(migration.fromPath);
  const toTilde = toTildePath(migration.toPath);
  if (fromTilde && toTilde && fromTilde !== migration.fromPath) {
    next = replaceExactPath(next, fromTilde, toTilde);
  }

  if (migration.oldWs && migration.newWs) {
    next = next.split(migration.oldWs).join(migration.newWs);
  }
  return next;
}
