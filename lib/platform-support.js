export const GITHUB_REPO_URL = "https://github.com/pedroyan/cursor-migrate";

export function getUnsupportedPlatformMessage(platform) {
  if (platform !== "win32") {
    return null;
  }

  return `Error: Windows is not currently supported.

cursor-migrate includes partial Windows support in the codebase, but it has
never been tested because the maintainer does not currently have access to a
Windows machine.

Contributions to finish and validate Windows support are welcome:

  ${GITHUB_REPO_URL}
`;
}

export function assertPlatformSupported(platform = process.platform) {
  const message = getUnsupportedPlatformMessage(platform);
  if (message) {
    console.error(message);
    process.exit(1);
  }
}
