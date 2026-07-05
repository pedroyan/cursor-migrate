import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function askYesNo(question, { defaultYes = false } = {}) {
  const rl = readline.createInterface({ input, output });
  try {
    const hint = defaultYes ? "Y/n" : "y/N";
    const answer = await rl.question(`${question} [${hint}]: `);
    const normalized = answer.trim().toLowerCase();
    if (normalized === "") {
      return defaultYes;
    }
    if (normalized === "y" || normalized === "yes") {
      return true;
    }
    if (normalized === "n" || normalized === "no") {
      return false;
    }
    return defaultYes;
  } finally {
    rl.close();
  }
}
