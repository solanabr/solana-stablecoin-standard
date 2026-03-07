import React, { useState } from "react";
import { Box, Text, useInput, Key } from "ink";
import { Connection } from "@solana/web3.js";

interface MintScreenProps {
  connection: Connection;
  mintAddress: string;
  onBack: () => void;
  onStatus: (msg: string) => void;
}

export const MintScreen: React.FC<MintScreenProps> = ({
  mintAddress,
  onBack,
  onStatus,
}) => {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [field, setField] = useState<"recipient" | "amount">("recipient");
  const [submitted, setSubmitted] = useState(false);

  useInput((input: string, key: Key) => {
    if (key.escape) { onBack(); return; }
    if (key.tab) setField((f) => f === "recipient" ? "amount" : "recipient");
    if (key.return && recipient && amount) {
      setSubmitted(true);
      onStatus(`Minting ${amount} tokens to ${recipient.slice(0, 8)}… (use CLI for actual tx)`);
    }
    if (key.backspace || key.delete) {
      if (field === "recipient") setRecipient((s) => s.slice(0, -1));
      else setAmount((s) => s.slice(0, -1));
      return;
    }
    if (!key.ctrl && !key.meta && input && input.length === 1) {
      if (field === "recipient") setRecipient((s) => s + input);
      else if (/[0-9.]/.test(input)) setAmount((s) => s + input);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" padding={1} width={60}>
      <Text bold color="green">💰 Mint Tokens</Text>
      <Text color="gray">Mint: {mintAddress.slice(0, 16)}…</Text>
      <Text> </Text>

      <Box flexDirection="column">
        <Box>
          <Text color={field === "recipient" ? "white" : "gray"}>
            Recipient:  {recipient || <Text color="gray">paste address…</Text>}
            {field === "recipient" && <Text color="white">█</Text>}
          </Text>
        </Box>
        <Box>
          <Text color={field === "amount" ? "white" : "gray"}>
            Amount:     {amount || <Text color="gray">e.g. 1000.00</Text>}
            {field === "amount" && <Text color="white">█</Text>}
          </Text>
        </Box>
      </Box>

      <Text> </Text>
      {submitted ? (
        <Text color="yellow">
          ⚠  TUI preview only. Run: sss-token mint --recipient {recipient} --amount {amount}
        </Text>
      ) : (
        <Text color="gray">Tab=switch field  Enter=preview  Esc=back</Text>
      )}
    </Box>
  );
};
