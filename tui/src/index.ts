#!/usr/bin/env node
import blessed from "blessed";

const screen = blessed.screen({ smartCSR: true, title: "SSS Admin TUI" });

const menu = blessed.list({
  parent: screen,
  label: " SSS Admin ",
  border: "line",
  width: "50%",
  height: "50%",
  top: "center",
  left: "center",
  keys: true,
  vi: true,
  mouse: true,
  style: { border: { fg: "cyan" }, selected: { bg: "blue" } },
  items: [
    "1. Initialize Stablecoin",
    "2. Mint Tokens",
    "3. Burn Tokens",
    "4. Grant Role",
    "5. Freeze Account",
    "6. Show Config",
    "7. Exit",
  ],
});

menu.on("select", (item) => {
  const text = item.getText();
  if (text.includes("Exit")) process.exit(0);
  
  const msg = blessed.message({
    parent: screen,
    border: "line",
    height: "shrink",
    width: "50%",
    top: "center",
    left: "center",
    label: " Action ",
    tags: true,
    keys: true,
    hidden: true,
  });

  msg.display(`Selected: ${text}\n\nUse CLI for actual operations:\nsss-token --help`, 0, () => {});
  screen.render();
});

menu.focus();
screen.key(["escape", "q", "C-c"], () => process.exit(0));
screen.render();
