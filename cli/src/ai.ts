/**
 * ============================================================================
 * SSS AI CLI Module
 * ============================================================================
 * 
 * Natural language interface for the Solana Stablecoin Standard.
 * Allows users to interact with the protocol using plain English commands.
 * 
 * Features:
 * - Intent recognition for common operations
 * - Context-aware responses
 * - Command suggestion and auto-completion
 * - Error explanation in plain language
 * - Interactive chat mode
 * 
 * Usage:
 *   sss ask "mint 1000 tokens to wallet abc123"
 *   sss ask "what's my balance?"
 *   sss ask "freeze account xyz456"
 *   sss chat  # Interactive mode
 */

import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ============================================================================
// TYPES
// ============================================================================

interface Intent {
  action: string;
  parameters: Record<string, string | number | boolean>;
  confidence: number;
  originalQuery: string;
}

interface CommandResult {
  success: boolean;
  message: string;
  data?: any;
  suggestedFollowUp?: string;
}

interface ConversationContext {
  lastMint?: string;
  lastAccount?: string;
  lastAmount?: number;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

// ============================================================================
// INTENT PATTERNS
// ============================================================================

const INTENT_PATTERNS: Array<{
  pattern: RegExp;
  action: string;
  extract: (match: RegExpMatchArray) => Record<string, any>;
}> = [
  // Minting
  {
    pattern: /mint\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:tokens?)?\s*(?:to\s+)?([A-Za-z0-9]{32,44})?/i,
    action: "mint",
    extract: (match) => ({
      amount: parseFloat(match[1].replace(/,/g, "")),
      recipient: match[2] || null,
    }),
  },
  {
    pattern: /create\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:new\s+)?tokens?/i,
    action: "mint",
    extract: (match) => ({
      amount: parseFloat(match[1].replace(/,/g, "")),
    }),
  },

  // Burning
  {
    pattern: /burn\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:tokens?)?/i,
    action: "burn",
    extract: (match) => ({
      amount: parseFloat(match[1].replace(/,/g, "")),
    }),
  },
  {
    pattern: /destroy\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s*tokens?/i,
    action: "burn",
    extract: (match) => ({
      amount: parseFloat(match[1].replace(/,/g, "")),
    }),
  },

  // Transfer
  {
    pattern: /(?:send|transfer)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:tokens?)?\s*(?:to\s+)?([A-Za-z0-9]{32,44})/i,
    action: "transfer",
    extract: (match) => ({
      amount: parseFloat(match[1].replace(/,/g, "")),
      recipient: match[2],
    }),
  },

  // Confidential Transfer
  {
    pattern: /(?:confidential(?:ly)?|private(?:ly)?)\s+(?:send|transfer)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:tokens?)?\s*(?:to\s+)?([A-Za-z0-9]{32,44})/i,
    action: "confidential_transfer",
    extract: (match) => ({
      amount: parseFloat(match[1].replace(/,/g, "")),
      recipient: match[2],
    }),
  },

  // Balance queries
  {
    pattern: /(?:what(?:'s| is)\s+)?(?:my\s+|the\s+)?balance/i,
    action: "balance",
    extract: () => ({}),
  },
  {
    pattern: /(?:how much|how many)\s+(?:tokens?\s+)?(?:do\s+)?(?:I\s+)?have/i,
    action: "balance",
    extract: () => ({}),
  },
  {
    pattern: /(?:check|show|get)\s+balance(?:\s+(?:of|for)\s+)?([A-Za-z0-9]{32,44})?/i,
    action: "balance",
    extract: (match) => ({
      account: match[1] || null,
    }),
  },

  // Supply queries
  {
    pattern: /(?:what(?:'s| is)\s+)?(?:the\s+)?(?:total\s+)?supply/i,
    action: "supply",
    extract: () => ({}),
  },
  {
    pattern: /(?:how many|how much)\s+tokens?\s+(?:are\s+)?(?:in\s+)?(?:circulation|exist)/i,
    action: "supply",
    extract: () => ({}),
  },

  // Freeze
  {
    pattern: /freeze\s+(?:account\s+)?([A-Za-z0-9]{32,44})/i,
    action: "freeze",
    extract: (match) => ({
      account: match[1],
    }),
  },

  // Thaw/Unfreeze
  {
    pattern: /(?:thaw|unfreeze)\s+(?:account\s+)?([A-Za-z0-9]{32,44})/i,
    action: "thaw",
    extract: (match) => ({
      account: match[1],
    }),
  },

  // Blacklist
  {
    pattern: /(?:blacklist|block|ban)\s+(?:account\s+)?([A-Za-z0-9]{32,44})/i,
    action: "blacklist",
    extract: (match) => ({
      account: match[1],
    }),
  },

  // Whitelist/Unblock
  {
    pattern: /(?:whitelist|unblock|remove\s+from\s+blacklist)\s+(?:account\s+)?([A-Za-z0-9]{32,44})/i,
    action: "whitelist",
    extract: (match) => ({
      account: match[1],
    }),
  },

  // Pause
  {
    pattern: /pause\s+(?:the\s+)?(?:token|mint|contract)?/i,
    action: "pause",
    extract: () => ({}),
  },

  // Unpause
  {
    pattern: /(?:unpause|resume)\s+(?:the\s+)?(?:token|mint|contract)?/i,
    action: "unpause",
    extract: () => ({}),
  },

  // Create token
  {
    pattern: /create\s+(?:a\s+)?(?:new\s+)?(?:stablecoin|token)\s*(?:called|named)?\s*"?([^"]+)"?/i,
    action: "create_token",
    extract: (match) => ({
      name: match[1].trim(),
    }),
  },

  // Status
  {
    pattern: /(?:status|info|information|details)\s*(?:of|for|about)?\s*(?:the\s+)?(?:token|mint)?/i,
    action: "status",
    extract: () => ({}),
  },

  // Holders
  {
    pattern: /(?:list|show|get)\s+(?:all\s+)?(?:token\s+)?holders?/i,
    action: "holders",
    extract: () => ({}),
  },

  // Help
  {
    pattern: /(?:help|what\s+can\s+(?:you|i)\s+do|commands?|how\s+(?:to|do\s+I))/i,
    action: "help",
    extract: () => ({}),
  },

  // Configure CT
  {
    pattern: /(?:configure|setup|enable)\s+(?:confidential\s+)?(?:transfers?|ct)/i,
    action: "configure_ct",
    extract: () => ({}),
  },

  // Deposit to CT
  {
    pattern: /deposit\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:tokens?)?\s*(?:to\s+)?(?:confidential|ct|private)/i,
    action: "ct_deposit",
    extract: (match) => ({
      amount: parseFloat(match[1].replace(/,/g, "")),
    }),
  },

  // Withdraw from CT
  {
    pattern: /withdraw\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:tokens?)?\s*(?:from\s+)?(?:confidential|ct|private)/i,
    action: "ct_withdraw",
    extract: (match) => ({
      amount: parseFloat(match[1].replace(/,/g, "")),
    }),
  },
];

// ============================================================================
// RESPONSE TEMPLATES
// ============================================================================

const RESPONSES = {
  mint: (params: any) => ({
    preview: `Minting ${params.amount.toLocaleString()} tokens${params.recipient ? ` to ${params.recipient.slice(0, 8)}...` : ""}`,
    command: `sss token mint --amount ${params.amount}${params.recipient ? ` --recipient ${params.recipient}` : ""}`,
    explanation: "This will create new tokens and increase the total supply.",
  }),

  burn: (params: any) => ({
    preview: `Burning ${params.amount.toLocaleString()} tokens`,
    command: `sss token burn --amount ${params.amount}`,
    explanation: "This will permanently destroy tokens and decrease the total supply.",
  }),

  transfer: (params: any) => ({
    preview: `Transferring ${params.amount.toLocaleString()} tokens to ${params.recipient.slice(0, 8)}...`,
    command: `sss token transfer --amount ${params.amount} --to ${params.recipient}`,
    explanation: "This will send tokens from your wallet to the recipient.",
  }),

  confidential_transfer: (params: any) => ({
    preview: `Confidentially transferring ${params.amount.toLocaleString()} tokens to ${params.recipient.slice(0, 8)}...`,
    command: `sss ct transfer --amount ${params.amount} --to ${params.recipient}`,
    explanation: "This will send tokens privately using zero-knowledge proofs. The amount will be hidden on-chain.",
  }),

  balance: (params: any) => ({
    preview: params.account ? `Checking balance of ${params.account.slice(0, 8)}...` : "Checking your balance",
    command: `sss token balance${params.account ? ` --account ${params.account}` : ""}`,
    explanation: "Shows both public and confidential token balances.",
  }),

  supply: () => ({
    preview: "Checking total token supply",
    command: "sss token supply",
    explanation: "Shows the total circulating supply of the token.",
  }),

  freeze: (params: any) => ({
    preview: `Freezing account ${params.account.slice(0, 8)}...`,
    command: `sss compliance freeze --account ${params.account}`,
    explanation: "This will prevent the account from sending or receiving tokens.",
  }),

  thaw: (params: any) => ({
    preview: `Unfreezing account ${params.account.slice(0, 8)}...`,
    command: `sss compliance thaw --account ${params.account}`,
    explanation: "This will restore the account's ability to transact.",
  }),

  blacklist: (params: any) => ({
    preview: `Blacklisting account ${params.account.slice(0, 8)}...`,
    command: `sss compliance blacklist --account ${params.account}`,
    explanation: "This will permanently block the account from all token operations. Cannot be undone through normal means.",
  }),

  whitelist: (params: any) => ({
    preview: `Removing ${params.account.slice(0, 8)}... from blacklist`,
    command: `sss compliance whitelist --account ${params.account}`,
    explanation: "This will remove the account from the blacklist (requires admin authority).",
  }),

  pause: () => ({
    preview: "Pausing all token operations",
    command: "sss admin pause",
    explanation: "This will halt all minting, burning, and transfers. Use for emergencies only.",
  }),

  unpause: () => ({
    preview: "Resuming token operations",
    command: "sss admin unpause",
    explanation: "This will re-enable all token operations after a pause.",
  }),

  status: () => ({
    preview: "Fetching token status",
    command: "sss token info",
    explanation: "Shows comprehensive information about the token including supply, authorities, and extensions.",
  }),

  holders: () => ({
    preview: "Listing token holders",
    command: "sss token holders",
    explanation: "Shows all accounts holding this token sorted by balance.",
  }),

  configure_ct: () => ({
    preview: "Configuring account for confidential transfers",
    command: "sss ct configure",
    explanation: "This will generate ElGamal keys and enable confidential transfers for your account.",
  }),

  ct_deposit: (params: any) => ({
    preview: `Depositing ${params.amount.toLocaleString()} tokens to confidential balance`,
    command: `sss ct deposit --amount ${params.amount}`,
    explanation: "Moves tokens from your public balance to encrypted confidential balance.",
  }),

  ct_withdraw: (params: any) => ({
    preview: `Withdrawing ${params.amount.toLocaleString()} tokens from confidential balance`,
    command: `sss ct withdraw --amount ${params.amount}`,
    explanation: "Moves tokens from encrypted confidential balance to public balance using ZK proofs.",
  }),

  help: () => ({
    preview: "Available commands",
    command: "sss --help",
    explanation: `
I can help you with the following operations:

📤 **Token Operations**
  • "mint 1000 tokens" - Create new tokens
  • "burn 500 tokens" - Destroy tokens
  • "send 100 tokens to <address>" - Transfer tokens
  • "check my balance" - View your balance
  • "total supply" - Check circulating supply

🔒 **Confidential Transfers (SSS-3)**
  • "configure confidential transfers" - Set up your account
  • "deposit 1000 to confidential" - Move to private balance
  • "privately send 500 to <address>" - Private transfer with ZK proofs
  • "withdraw 200 from confidential" - Move back to public

⚖️ **Compliance (SSS-2)**
  • "freeze account <address>" - Freeze an account
  • "unfreeze account <address>" - Thaw an account
  • "blacklist <address>" - Block an account
  • "whitelist <address>" - Unblock an account

🔧 **Admin**
  • "pause" - Emergency stop all operations
  • "unpause" - Resume operations
  • "status" - Token information

Just tell me what you want to do in plain English!
    `,
  }),

  create_token: (params: any) => ({
    preview: `Creating new stablecoin: "${params.name}"`,
    command: `sss token create --name "${params.name}" --symbol "${params.name.slice(0, 4).toUpperCase()}" --preset 2`,
    explanation: "This will deploy a new SSS-compliant stablecoin with the specified name.",
  }),
};

// ============================================================================
// AI ENGINE
// ============================================================================

export class SSSAIEngine {
  private context: ConversationContext;

  constructor() {
    this.context = {
      history: [],
    };
  }

  /**
   * Parse a natural language query into an intent
   */
  parseIntent(query: string): Intent | null {
    const normalizedQuery = query.trim().toLowerCase();

    for (const { pattern, action, extract } of INTENT_PATTERNS) {
      const match = normalizedQuery.match(pattern);
      if (match) {
        return {
          action,
          parameters: extract(match),
          confidence: 0.9,
          originalQuery: query,
        };
      }
    }

    // Fallback: try to understand context
    if (this.context.lastMint && /again|repeat|same/i.test(query)) {
      return {
        action: "mint",
        parameters: { amount: this.context.lastAmount || 100 },
        confidence: 0.6,
        originalQuery: query,
      };
    }

    return null;
  }

  /**
   * Process a query and return a response
   */
  async processQuery(query: string): Promise<CommandResult> {
    const intent = this.parseIntent(query);

    if (!intent) {
      return {
        success: false,
        message: `I'm not sure what you mean by "${query}". Try asking something like:
        
  • "mint 1000 tokens"
  • "check my balance"
  • "send 500 tokens to <address>"
  • "help" - for full command list`,
        suggestedFollowUp: "Type 'help' to see all available commands",
      };
    }

    const responseGenerator = RESPONSES[intent.action as keyof typeof RESPONSES];
    if (!responseGenerator) {
      return {
        success: false,
        message: `I understand you want to "${intent.action}" but I don't have a handler for that yet.`,
      };
    }

    const response = responseGenerator(intent.parameters);

    // Update context
    this.context.history.push({ role: "user", content: query });
    if (intent.action === "mint") {
      this.context.lastMint = response.command;
      this.context.lastAmount = intent.parameters.amount as number;
    }

    return {
      success: true,
      message: response.explanation,
      data: {
        intent,
        preview: response.preview,
        command: response.command,
        confidence: intent.confidence,
      },
    };
  }

  /**
   * Get suggestions for partial input
   */
  getSuggestions(partial: string): string[] {
    const suggestions: string[] = [];
    const normalized = partial.toLowerCase();

    const examples = [
      "mint 1000 tokens",
      "burn 500 tokens",
      "send 100 tokens to <address>",
      "check my balance",
      "total supply",
      "freeze account <address>",
      "unfreeze account <address>",
      "blacklist <address>",
      "pause",
      "unpause",
      "configure confidential transfers",
      "deposit 1000 to confidential",
      "privately send 500 to <address>",
      "withdraw 200 from confidential",
      "status",
      "holders",
      "help",
    ];

    for (const example of examples) {
      if (example.toLowerCase().includes(normalized)) {
        suggestions.push(example);
      }
    }

    return suggestions.slice(0, 5);
  }

  /**
   * Clear conversation context
   */
  clearContext(): void {
    this.context = {
      history: [],
    };
  }
}

// ============================================================================
// CLI COMMANDS
// ============================================================================

export async function handleAskCommand(query: string): Promise<void> {
  const engine = new SSSAIEngine();
  const spinner = ora("Understanding your request...").start();

  const result = await engine.processQuery(query);

  if (result.success && result.data) {
    spinner.succeed(chalk.green(result.data.preview));
    
    console.log();
    console.log(chalk.dim("  📝 Explanation:"));
    console.log(chalk.white(`     ${result.message}`));
    console.log();
    console.log(chalk.dim("  💻 Equivalent command:"));
    console.log(chalk.cyan(`     ${result.data.command}`));
    console.log();
    
    if (result.data.confidence < 0.8) {
      console.log(chalk.yellow(`  ⚠️  Confidence: ${(result.data.confidence * 100).toFixed(0)}% - please verify`));
    }

    // Ask for confirmation
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: "Would you like to execute this command?",
        default: false,
      },
    ]);

    if (confirm) {
      console.log(chalk.green("\n  ✓ Command would be executed (simulation mode)\n"));
      // In production: actually execute the command
    } else {
      console.log(chalk.dim("\n  Command cancelled\n"));
    }
  } else {
    spinner.fail(chalk.red("Couldn't understand request"));
    console.log(chalk.yellow(`\n  ${result.message}`));
    if (result.suggestedFollowUp) {
      console.log(chalk.dim(`\n  💡 ${result.suggestedFollowUp}\n`));
    }
  }
}

export async function handleChatCommand(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(chalk.yellow("\n⚠️ Chat mode requires an interactive terminal (TTY).\n"));
    console.log(chalk.dim("Use `sss ask \"<query>\"` for non-interactive usage.\n"));
    return;
  }

  const engine = new SSSAIEngine();
  
  console.log(chalk.bold("\n🤖 SSS AI Assistant"));
  console.log(chalk.dim("───────────────────────────────────────────"));
  console.log(chalk.dim("Type your requests in natural language."));
  console.log(chalk.dim("Type 'exit' or 'quit' to leave.\n"));

  let running = true;

  while (running) {
    let input = "";
    try {
      const promptResult = await inquirer.prompt([
        {
          type: "input",
          name: "input",
          message: chalk.cyan("You:"),
          prefix: "",
        },
      ]);
      input = String(promptResult.input ?? "");
    } catch (err: any) {
      if (err?.code === "ERR_USE_AFTER_CLOSE") {
        console.log(chalk.dim("\nChat session closed.\n"));
        break;
      }
      throw err;
    }

    const query = input.trim();

    if (!query) continue;
    if (/^(exit|quit|bye|goodbye)$/i.test(query)) {
      console.log(chalk.green("\n👋 Goodbye!\n"));
      running = false;
      continue;
    }

    if (query === "clear") {
      engine.clearContext();
      console.log(chalk.dim("  Context cleared\n"));
      continue;
    }

    const result = await engine.processQuery(query);

    if (result.success && result.data) {
      console.log(chalk.green(`\n  🤖 ${result.data.preview}`));
      console.log(chalk.white(`     ${result.message}`));
      console.log(chalk.dim(`     Command: ${result.data.command}\n`));
    } else {
      console.log(chalk.yellow(`\n  🤖 ${result.message}\n`));
    }
  }
}

export async function handleSuggestCommand(partial: string): Promise<void> {
  const engine = new SSSAIEngine();
  const suggestions = engine.getSuggestions(partial);

  if (suggestions.length === 0) {
    console.log(chalk.yellow("\n  No suggestions found\n"));
    return;
  }

  console.log(chalk.bold("\n📝 Suggestions:\n"));
  for (const suggestion of suggestions) {
    console.log(chalk.cyan(`  • ${suggestion}`));
  }
  console.log();
}
