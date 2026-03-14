/**
 * Parse Anchor/Solana/Wallet errors into readable messages.
 */
export function parseError(err: any): string {
  const msg = err?.message || err?.toString() || "Unknown error";

  // Wallet errors
  if (msg.includes("User rejected")) {
    return "Transaction rejected by wallet.";
  }
  if (msg.includes("Unexpected error")) {
    return "Wallet error — make sure Phantom is set to Devnet and try again.";
  }
  if (msg.includes("Insufficient funds") || msg.includes("insufficient lamports")) {
    return "Insufficient SOL for transaction fees.";
  }

  // Transaction simulation failed — extract inner error
  if (msg.includes("Transaction simulation failed")) {
    const innerMatch = msg.match(/Error Message: (.+?)(?:\.|$)/);
    if (innerMatch) return innerMatch[1];
  }

  // Check logs for specific errors
  const logs: string[] = err?.logs || err?.simulationResponse?.logs || [];
  const fullText = msg + " " + logs.join(" ");

  if (fullText.includes("frozen") || fullText.includes("0x11")) {
    return "Account is frozen. Thaw it first before transferring.";
  }
  if (fullText.includes("Sender is not on the allowlist")) {
    return "Sender is not on the allowlist";
  }
  if (fullText.includes("Recipient is not on the allowlist")) {
    return "Recipient is not on the allowlist";
  }
  if (fullText.includes("Sender is blacklisted")) {
    return "Sender is blacklisted";
  }
  if (fullText.includes("Recipient is blacklisted")) {
    return "Recipient is blacklisted";
  }
  if (fullText.includes("paused") || fullText.includes("Paused")) {
    return "Token operations are paused.";
  }

  // Anchor program errors
  const anchorMatch = msg.match(/custom program error: 0x([0-9a-fA-F]+)/);
  if (anchorMatch) {
    const code = parseInt(anchorMatch[1], 16);
    const anchorCode = code - 6000;
    const programErrors: Record<number, string> = {
      0: "Token operations are paused",
      1: "Unauthorized: you don't have the required role.",
      2: "Minter quota exceeded",
      3: "Amount must be greater than zero",
      4: "Compliance features are not enabled",
      5: "Address is already blacklisted",
      6: "Address is not blacklisted",
      7: "Address is blacklisted",
      8: "Name exceeds maximum length",
      9: "Symbol exceeds maximum length",
      10: "URI exceeds maximum length",
      11: "Invalid decimals (must be <= 9)",
      12: "Math overflow",
      13: "Invalid role",
      14: "Already paused",
      15: "Not paused",
      16: "Cannot seize from non-blacklisted account",
      17: "Insufficient balance for burn",
      18: "Account is frozen",
      19: "Account is not frozen",
      20: "No pending authority transfer",
      21: "Supply cap would be exceeded",
      22: "Allowlist is not enabled",
      23: "Address is not on the allowlist",
      24: "Not the pending authority",
      25: "Blacklist reason exceeds maximum length",
      29: "Role is not active",
    };
    if (anchorCode in programErrors) {
      return programErrors[anchorCode];
    }
  }

  // Anchor constraint errors
  if (msg.includes("AccountNotInitialized") || msg.includes("Account does not exist")) {
    return "Account not found. You may need to assign the role first via the Roles page.";
  }
  if (msg.includes("ConstraintSeeds") || msg.includes("seeds constraint")) {
    return "PDA mismatch — check the mint address and connected wallet.";
  }
  if (msg.includes("ConstraintHasOne")) {
    return "Account mismatch — the connected wallet may not be the authority.";
  }
  if (msg.includes("already in use")) {
    return "This account already exists (e.g., role already assigned or address already on list).";
  }

  // Generic simulation failure
  if (msg.includes("Transaction simulation failed")) {
    const hexMatch = fullText.match(/custom program error: 0x([0-9a-fA-F]+)/);
    if (hexMatch) {
      return `Transaction failed (program error 0x${hexMatch[1]}). Check browser console for details.`;
    }
    return "Transaction simulation failed — check inputs and permissions.";
  }

  if (msg.length > 120) {
    return msg.slice(0, 117) + "...";
  }
  return msg;
}
