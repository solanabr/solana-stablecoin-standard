const fs = require("node:fs");
const path = require("node:path");

const stablecoinPath = path.join(__dirname, "..", "src", "stablecoin.ts");
const source = fs.readFileSync(stablecoinPath, "utf8");

const checks = [
  {
    name: "empty instruction payload placeholders",
    regex: /data:\s*Buffer\.from\(\[\]\)/g,
    severity: "error",
    guidance: "Replace placeholder `Buffer.from([])` with serialized instruction data matching Anchor discriminator + args.",
  },
  {
    name: "simplified config parser",
    regex: /Simplified parser|parse account data \(simplified/i,
    severity: "error",
    guidance: "Use Anchor `BorshAccountsCoder` (or equivalent) to decode on-chain config account data.",
  },
  {
    name: "explicit placeholder comments",
    regex: /placeholder|stubs - in real impl/gi,
    severity: "warning",
    guidance: "Replace placeholder builders with production instruction encoding and account metas aligned to on-chain IDL.",
  },
];

let hasError = false;
console.log("SDK validation report\n");

for (const check of checks) {
  const matches = source.match(check.regex) || [];
  if (matches.length > 0) {
    if (check.severity === "error") {
      hasError = true;
    }
    console.log(`- [${check.severity.toUpperCase()}] ${check.name}: ${matches.length} match(es)`);
    console.log(`  -> ${check.guidance}`);
  } else {
    console.log(`- [OK] ${check.name}`);
  }
}

console.log("");
if (hasError) {
  console.error("SDK validation FAILED: production-critical gaps detected.");
  process.exit(1);
}

console.log("SDK validation PASSED: no critical placeholder patterns detected.");
