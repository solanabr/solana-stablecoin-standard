import * as https from "node:https";

import { Command } from "commander";

const SSS_SYSTEM_PROMPT = `You are an expert assistant for the Solana Stablecoin Standard (SSS). Answer questions concisely and accurately based on the following reference.

# Solana Stablecoin Standard (SSS) Reference

## Presets
- SSS-1 (Basic): Mint, burn, freeze, thaw, pause/unpause. Minimal compliance. Good for internal or test tokens.
- SSS-2 (Compliance): Everything in SSS-1 plus blacklist (with reason), seize tokens from blacklisted addresses. Designed for regulated stablecoins.
- SSS-3 (Allowlist): Everything in SSS-2 plus allowlist. Only allowlisted addresses can receive tokens. Transfer hook enforces allowlist on every transfer.

## Roles (assigned per-config PDA)
- admin: Full authority. Can assign/revoke all other roles, transfer authority, set supply cap, manage oracle.
- minter: Can mint tokens up to a per-minter quota. Quota is set by admin.
- pauser: Can pause/unpause the token (stops all transfers, mints, burns while paused).
- freezer: Can freeze/thaw individual token accounts.
- blacklister: Can add/remove addresses from the blacklist (SSS-2+).
- seizer: Can seize tokens from blacklisted addresses to a treasury (SSS-2+).

## Key Operations
- initialize: Create a new stablecoin config + mint. Choose preset, name, symbol, decimals, URI.
  CLI: sss-token init --preset sss-2 --name "USD Coin" --symbol USDC --decimals 6
- mint: Mint tokens to a recipient ATA. Requires minter role + sufficient quota.
  CLI: sss-token mint <recipient> <amount>
- burn: Burn tokens from caller's own account.
  CLI: sss-token burn <amount>
- freeze / thaw: Freeze or thaw a specific token account. Requires freezer role.
  CLI: sss-token freeze <token-account>  |  sss-token thaw <token-account>
- pause / unpause: Pause or unpause the entire stablecoin. Requires pauser role or admin.
  CLI: sss-token pause  |  sss-token unpause
- status: Show on-chain config state (authority, paused, compliance, supply).
  CLI: sss-token status
- supply: Show totalMinted, totalBurned, netSupply.
  CLI: sss-token supply

## Compliance (SSS-2+)
- blacklist add <address> [--reason <text>]: Blacklist an address with optional reason. Requires blacklister role.
- blacklist remove <address>: Remove from blacklist.
- blacklist check <address>: Check blacklist status.
- seize <from-owner> --to <treasury> --amount <n>: Seize tokens from blacklisted address. Requires seizer role.

## Allowlist (SSS-3)
- allowlist add <address>: Add address to allowlist. Requires admin.
- allowlist remove <address>: Remove from allowlist.
- allowlist check <address>: Check allowlist status.
- Transfer hook automatically rejects transfers to non-allowlisted addresses.

## Authority & Admin
- Two-step authority transfer: initiate-transfer -> accept-transfer (safer).
  CLI: sss-token authority initiate-transfer <new-authority>
  CLI: sss-token authority accept-transfer
- Single-step transfer: sss-token authority transfer <new-authority> (immediate, use with caution).
- Assign role: sss-token role assign <role> <address>
- Revoke role: sss-token role revoke <role> <address>
- Set supply cap: sss-token management set-supply-cap <amount>
- Set minter quota: sss-token management set-minter-quota <minter> <amount>

## Oracle
- Set oracle: sss-token oracle set <oracle-address>
- Remove oracle: sss-token oracle remove
- Oracle can provide price feeds or attestations consumed by the program.

## Configuration
- sss-token config init: Create default CLI config file.
- sss-token config set <key> <value>: Set config (mintAddress, cluster, keypair, rpcUrl, programId).
- sss-token config show: Show current config.
- sss-token config path: Print config file path.

## Architecture
- Built on Solana Token-2022 (SPL Token Extensions).
- Uses Anchor framework for program instructions.
- PDAs: config (per mint), role entries, blacklist entries, allowlist entries, minter quotas.
- Transfer hook program (SSS-3) enforces allowlist checks on every SPL transfer.

Answer the user's question. Be direct, provide CLI commands when relevant, and note which preset is required for specific features.`;

function callGroqApi(question: string, apiKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SSS_SYSTEM_PROMPT },
        { role: "user", content: question },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    });

    const options = {
      hostname: "api.groq.com",
      port: 443,
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk: Buffer) => {
        data += chunk.toString();
      });

      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          let detail = "";
          try {
            const parsed = JSON.parse(data);
            detail = parsed.error?.message ?? data;
          } catch {
            detail = data;
          }
          reject(
            new Error(
              `Groq API returned HTTP ${res.statusCode}: ${detail}`,
            ),
          );
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const content: string | undefined =
            parsed.choices?.[0]?.message?.content;
          if (!content) {
            reject(new Error("No response content from Groq API."));
            return;
          }
          resolve(content);
        } catch (err) {
          reject(
            new Error(
              `Failed to parse Groq API response: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
        }
      });
    });

    req.on("error", (err: Error) => {
      reject(new Error(`Network error calling Groq API: ${err.message}`));
    });

    req.setTimeout(30_000, () => {
      req.destroy();
      reject(new Error("Groq API request timed out after 30 seconds."));
    });

    req.write(body);
    req.end();
  });
}

function wrapText(text: string, width: number): string {
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    if (paragraph.length <= width) {
      lines.push(paragraph);
      continue;
    }

    // Preserve indented / bullet lines as-is if they are short enough,
    // otherwise wrap them too.
    const indent = paragraph.match(/^(\s*(?:[-*]\s)?)/)?.[0] ?? "";
    const words = paragraph.split(/\s+/);
    let current = "";

    for (const word of words) {
      if (current.length === 0) {
        current = word;
      } else if (current.length + 1 + word.length > width) {
        lines.push(current);
        current = indent + word;
      } else {
        current += " " + word;
      }
    }

    if (current.length > 0) {
      lines.push(current);
    }
  }

  return lines.join("\n");
}

export function registerAskCommand(program: Command): void {
  program
    .command("ask <question>")
    .description(
      "Ask an AI assistant about SSS features, commands, and usage",
    )
    .action(async (_question: string) => {
      const apiKey = process.env.GROQ_API_KEY;

      if (!apiKey) {
        process.stderr.write(
          [
            "Error: No Groq API key found.",
            "",
            "Set the GROQ_API_KEY environment variable to use the ask command.",
            "You can get a free API key at: https://console.groq.com",
            "",
            "  export GROQ_API_KEY=gsk_...",
            "",
          ].join("\n"),
        );
        process.exitCode = 1;
        return;
      }

      const question = _question.trim();
      if (question.length === 0) {
        process.stderr.write("Error: Please provide a question.\n");
        process.exitCode = 1;
        return;
      }

      process.stdout.write("Thinking...\n\n");

      try {
        const answer = await callGroqApi(question, apiKey);

        // Determine terminal width, default to 80 if unavailable
        const termWidth = process.stdout.columns || 80;
        const formatted = wrapText(answer.trim(), termWidth);

        process.stdout.write(formatted + "\n");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${msg}\n`);
        process.exitCode = 1;
      }
    });
}
