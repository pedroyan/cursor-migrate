import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";

const SELECTED = "\x1b[36m\x1b[1m";
const RESET = "\x1b[0m";
const HINT = "\x1b[2m";

export function formatSelectLine(label, selected, useColor) {
  if (selected) {
    return useColor ? `${SELECTED}> ${label}${RESET}` : `> ${label}`;
  }
  return `  ${label}`;
}

function renderList({ title, items, index, useColor }) {
  readline.cursorTo(output, 0, 0);
  readline.clearScreenDown(output);
  console.log(title);
  for (let i = 0; i < items.length; i += 1) {
    console.log(formatSelectLine(items[i], i === index, useColor));
  }
  console.log(
    useColor
      ? `${HINT}↑/↓ select · Enter confirm · Esc cancel${RESET}`
      : "↑/↓ select · Enter confirm · Esc cancel",
  );
}

async function selectWithRawKeys(items, { title, useColor }) {
  let index = 0;

  readline.emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();

  renderList({ title, items, index, useColor });

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      input.removeListener("keypress", onKeypress);
      input.setRawMode(false);
      input.pause();
    };

    const onKeypress = (_str, key) => {
      if (key.name === "up") {
        index = (index - 1 + items.length) % items.length;
        renderList({ title, items, index, useColor });
        return;
      }
      if (key.name === "down") {
        index = (index + 1) % items.length;
        renderList({ title, items, index, useColor });
        return;
      }
      if (key.name === "return") {
        cleanup();
        resolve(index);
        return;
      }
      if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        cleanup();
        reject(new Error("Revert cancelled."));
      }
    };

    input.on("keypress", onKeypress);
  });
}

async function selectWithNumberedPrompt(items, { title }) {
  console.log(title);
  for (let i = 0; i < items.length; i += 1) {
    console.log(`${i + 1}. ${items[i]}`);
  }

  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const answer = await rl.question(`Select backup [1-${items.length}]: `);
      const choice = Number.parseInt(answer.trim(), 10);
      if (Number.isInteger(choice) && choice >= 1 && choice <= items.length) {
        return choice - 1;
      }
      console.log(`Enter a number between 1 and ${items.length}.`);
    }
  } finally {
    rl.close();
  }
}

export async function selectFromList(items, { title = "Select an item:", useColor = output.isTTY } = {}) {
  if (items.length === 0) {
    throw new Error("No items to select.");
  }
  if (items.length === 1) {
    console.log(`${title}\n> ${items[0]}`);
    return 0;
  }
  if (input.isTTY && output.isTTY) {
    return selectWithRawKeys(items, { title, useColor });
  }
  return selectWithNumberedPrompt(items, { title });
}
