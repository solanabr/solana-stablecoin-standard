#!/usr/bin/env ts-node
/**
 * SSS Dashboard -- Terminal UI for monitoring a Solana Stablecoin Standard token
 *
 * Usage:
 *   npx ts-node scripts/dashboard.ts --mint <MINT_ADDRESS> [--rpc <URL>] [--interval <ms>]
 */
import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { getMint, getTokenMetadata, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Constants & ANSI codes
// ---------------------------------------------------------------------------
const PROGRAM_ID = new PublicKey("G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL");
const CONFIG_SEED = Buffer.from("config");
const ROLE_SEED = Buffer.from("role");
const ROLE_NAMES: Record<number, string> = {
  0: "Admin", 1: "Minter", 2: "Pauser", 3: "Freezer", 4: "Blacklister", 5: "Seizer",
};

const CLEAR = "\x1b[2J\x1b[H";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RST = "\x1b[0m";

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
function parseArgs(): { mint: string; rpc: string; interval: number } {
  const args = process.argv.slice(2);
  let mint = "", rpc = clusterApiUrl("devnet"), interval = 5000;
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--mint":     mint = args[++i] ?? ""; break;
      case "--rpc":      rpc = args[++i] ?? rpc; break;
      case "--interval": interval = parseInt(args[++i] ?? "5000", 10); break;
      case "--help": case "-h":
        console.log("Usage: npx ts-node scripts/dashboard.ts --mint <ADDR> [--rpc <URL>] [--interval <ms>]");
        process.exit(0);
    }
  }
  if (!mint) {
    console.error(`${RED}Error: --mint <ADDRESS> is required${RST}`);
    console.error("Usage: npx ts-node scripts/dashboard.ts --mint <ADDR> [--rpc <URL>] [--interval <ms>]");
    process.exit(1);
  }
  return { mint, rpc, interval };
}

// ---------------------------------------------------------------------------
// PDA helpers
// ---------------------------------------------------------------------------
function configPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED, mint.toBuffer()], PROGRAM_ID);
}
function rolePDA(config: PublicKey, role: number, holder: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ROLE_SEED, config.toBuffer(), Buffer.from([role]), holder.toBuffer()], PROGRAM_ID,
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
function trunc(addr: PublicKey | string): string {
  const s = typeof addr === "string" ? addr : addr.toBase58();
  return s.length <= 11 ? s : `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function fmtAmt(raw: BN, dec: number): string {
  const divisor = new BN(10).pow(new BN(dec));
  const whole = raw.div(divisor);
  const frac = raw.mod(divisor).toString(10).padStart(dec, "0");
  return `${BigInt(whole.toString()).toLocaleString("en-US")}.${frac}`;
}

const hr = (w: number) => "\u2500".repeat(w);
const stColor = (on: boolean, y: string, n: string) => on ? `${GREEN}${y}${RST}` : `${RED}${n}${RST}`;

// ---------------------------------------------------------------------------
// Role fetching
// ---------------------------------------------------------------------------
interface RoleInfo { name: string; holder: PublicKey; active: boolean }

async function fetchRoles(prog: Program, cfg: PublicKey, auth: PublicKey): Promise<RoleInfo[]> {
  const roles: RoleInfo[] = [];
  for (const [byte, name] of Object.entries(ROLE_NAMES)) {
    const [pda] = rolePDA(cfg, parseInt(byte, 10), auth);
    try {
      const acct = await (prog.account as any).roleAssignment.fetch(pda);
      roles.push({ name, holder: acct.holder, active: acct.active });
    } catch { /* not assigned */ }
  }
  return roles;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
interface Data {
  name: string; symbol: string; mint: PublicKey; authority: PublicKey;
  cfgPDA: PublicKey; paused: boolean; complianceEnabled: boolean;
  enableAllowlist: boolean; supplyCap: BN; totalMinted: BN;
  totalBurned: BN; decimals: number; roles: RoleInfo[];
}

function render(d: Data): void {
  const W = 50;
  const out: string[] = [CLEAR];

  // Header
  out.push(` ${BOLD}SSS Dashboard - ${d.name} (${d.symbol})${RST}`);
  out.push(` ${DIM}${hr(W)}${RST}`);
  out.push(` Mint:       ${trunc(d.mint)}`);
  out.push(` Authority:  ${trunc(d.authority)}`);
  out.push(` Config PDA: ${trunc(d.cfgPDA)}`);
  out.push("");

  // Status
  out.push(` ${BOLD}Status${RST}`);
  out.push(` ${DIM}${hr(W)}${RST}`);
  out.push(` Paused:      ${stColor(!d.paused, "No", "YES -- PAUSED")}`);
  out.push(` Compliance:  ${stColor(d.complianceEnabled, "Enabled", "Disabled")}`);
  out.push(` Allowlist:   ${stColor(d.enableAllowlist, "Enabled", "Disabled")}`);
  const capZero = d.supplyCap.isZero();
  out.push(` Supply Cap:  ${capZero ? `${GREEN}Unlimited${RST}` : fmtAmt(d.supplyCap, d.decimals)}`);
  out.push("");

  // Supply
  out.push(` ${BOLD}Supply${RST}`);
  out.push(` ${DIM}${hr(W)}${RST}`);
  out.push(` Total Minted:  ${fmtAmt(d.totalMinted, d.decimals)}`);
  out.push(` Total Burned:  ${fmtAmt(d.totalBurned, d.decimals)}`);
  const circ = d.totalMinted.sub(d.totalBurned);
  out.push(` Circulating:   ${circ.isNeg()
    ? `${RED}${fmtAmt(circ.abs(), d.decimals)} (negative!)${RST}`
    : fmtAmt(circ, d.decimals)}`);
  if (capZero) {
    out.push(` Cap Remaining: ${GREEN}Unlimited${RST}`);
  } else {
    const rem = d.supplyCap.sub(circ);
    out.push(` Cap Remaining: ${rem.isNeg()
      ? `${RED}EXCEEDED by ${fmtAmt(rem.abs(), d.decimals)}${RST}`
      : fmtAmt(rem, d.decimals)}`);
  }
  out.push("");

  // Roles
  const act = d.roles.filter(r => r.active).length;
  const tot = d.roles.length;
  out.push(` ${BOLD}Roles${RST} (${act} active${tot > act ? `, ${tot - act} inactive` : ""})`);
  out.push(` ${DIM}${hr(W)}${RST}`);
  if (tot === 0) {
    out.push(` ${DIM}No roles assigned${RST}`);
  } else {
    for (const r of d.roles) {
      out.push(` ${r.name.padEnd(12)}${trunc(r.holder)}  ${r.active ? `${GREEN}Active${RST}` : `${RED}Revoked${RST}`}`);
    }
  }
  out.push("");

  // Footer
  out.push(` ${DIM}Last updated: ${new Date().toISOString()}${RST}`);
  out.push(` ${DIM}Press Ctrl+C to exit${RST}`);
  process.stdout.write(out.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const { mint: mintStr, rpc, interval } = parseArgs();

  let mintKey: PublicKey;
  try { mintKey = new PublicKey(mintStr); } catch {
    console.error(`${RED}Error: Invalid mint address: ${mintStr}${RST}`);
    process.exit(1);
  }

  const conn = new Connection(rpc, "confirmed");
  const provider = new AnchorProvider(conn, new Wallet(Keypair.generate()), { commitment: "confirmed" });

  const idlPath = path.resolve(__dirname, "../target/idl/sss_core.json");
  if (!fs.existsSync(idlPath)) {
    console.error(`${RED}Error: IDL not found at ${idlPath}${RST}`);
    console.error("Run `anchor build` first.");
    process.exit(1);
  }
  const program = new Program(JSON.parse(fs.readFileSync(idlPath, "utf8")), provider);
  const [cfgPDA] = configPDA(mintKey);

  async function tick(): Promise<void> {
    try {
      const cfg = await (program.account as any).stablecoinConfig.fetch(cfgPDA);

      let decimals = 6;
      try {
        decimals = (await getMint(conn, mintKey, "confirmed", TOKEN_2022_PROGRAM_ID)).decimals;
      } catch { /* default */ }

      let name = "Unknown", symbol = "???";
      try {
        const md = await getTokenMetadata(conn, mintKey, "confirmed", TOKEN_2022_PROGRAM_ID);
        if (md) { name = md.name; symbol = md.symbol; }
      } catch { /* no metadata */ }

      const roles = await fetchRoles(program, cfgPDA, cfg.authority);

      render({
        name, symbol, mint: mintKey, authority: cfg.authority, cfgPDA,
        paused: cfg.paused, complianceEnabled: cfg.complianceEnabled,
        enableAllowlist: cfg.enableAllowlist, supplyCap: cfg.supplyCap,
        totalMinted: cfg.totalMinted, totalBurned: cfg.totalBurned,
        decimals, roles,
      });
    } catch (err: any) {
      const msg = err?.message?.includes("Account does not exist")
        ? "StablecoinConfig not found. Is the mint correct and initialized?"
        : (err?.message ?? String(err));
      process.stdout.write(CLEAR);
      process.stdout.write([
        ` ${BOLD}SSS Dashboard${RST}`,
        ` ${DIM}${hr(50)}${RST}`,
        ` Mint: ${trunc(mintKey)}`,
        ` RPC:  ${rpc}`,
        "",
        ` ${RED}Error: ${msg}${RST}`,
        "",
        ` ${DIM}Retrying in ${interval / 1000}s...${RST}`,
        ` ${DIM}Press Ctrl+C to exit${RST}`,
      ].join("\n") + "\n");
    }
  }

  await tick();
  const timer = setInterval(tick, interval);

  process.on("SIGINT", () => {
    clearInterval(timer);
    process.stdout.write(CLEAR);
    process.stdout.write(`\n ${BOLD}SSS Dashboard${RST} -- Goodbye!\n\n`);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`${RED}Fatal: ${err.message ?? err}${RST}`);
  process.exit(1);
});
