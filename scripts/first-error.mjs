import { readFile } from "node:fs/promises";

const path = process.argv[2];

if (!path) {
  process.stderr.write("usage: node scripts/first-error.mjs <build-log-path>\n");
  process.exit(1);
}

const content = await readFile(path, "utf8");
const lines = content.split(/\r?\n/);
const errorIndex = lines.findIndex((line) => line.startsWith("error:") || line.startsWith("error["));

if (errorIndex < 0) {
  process.stdout.write("No error block found.\n");
  process.exit(0);
}

const start = Math.max(0, errorIndex - 10);
const end = Math.min(lines.length, errorIndex + 40);
process.stdout.write(lines.slice(start, end).join("\n"));
process.stdout.write("\n");
