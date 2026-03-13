import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

function optionalEnv(name) {
  return process.env[name] ?? null;
}

async function sha256File(path) {
  try {
    const data = await readFile(path);
    return createHash("sha256").update(data).digest("hex");
  } catch {
    return null;
  }
}

function gitRevParse() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8"
    }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const outFlagIndex = process.argv.indexOf("--out");
  const outPath = resolve(
    process.cwd(),
    outFlagIndex >= 0 ? process.argv[outFlagIndex + 1] : "artifacts/devnet-manifest.json"
  );

  const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8"));
  const sdkPackageJson = JSON.parse(await readFile(resolve(process.cwd(), "sdk/package.json"), "utf8"));
  const backendPackageJson = JSON.parse(await readFile(resolve(process.cwd(), "backend/package.json"), "utf8"));

  const manifest = {
    generatedAt: new Date().toISOString(),
    gitCommit: gitRevParse(),
    rpcUrl: process.env.SSS_RPC_URL ?? "https://api.devnet.solana.com",
    packages: {
      root: packageJson.name,
      sdk: sdkPackageJson.version,
      backend: backendPackageJson.version
    },
    programs: {
      stablecoin: {
        id: optionalEnv("SSS_STABLECOIN_PROGRAM_ID"),
        binaryPath: "target/deploy/stablecoin.so",
        sha256: await sha256File(resolve(process.cwd(), "target/deploy/stablecoin.so"))
      },
      transferHook: {
        id: optionalEnv("SSS_TRANSFER_HOOK_PROGRAM_ID"),
        binaryPath: "target/deploy/transfer_hook.so",
        sha256: await sha256File(resolve(process.cwd(), "target/deploy/transfer_hook.so"))
      },
      registry: {
        id: optionalEnv("SSS_REGISTRY_PROGRAM_ID"),
        binaryPath: "target/deploy/sss_registry.so",
        sha256: await sha256File(resolve(process.cwd(), "target/deploy/sss_registry.so"))
      }
    },
    exampleMints: {
      sss1: optionalEnv("SSS1_MINT"),
      sss2: optionalEnv("SSS2_MINT"),
      sss3: optionalEnv("SSS3_MINT")
    }
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${outPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
