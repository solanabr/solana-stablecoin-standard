import React, { useState } from "react";
import { Box, Text, useInput, Key } from "ink";
import { Connection } from "@solana/web3.js";

interface BlacklistScreenProps {
  connection: Connection;
  mintAddress: string;
  onBack: () => void;
  onStatus: (msg: string) => void;
}

export const BlacklistScreen: React.FC<BlacklistScreenProps> = ({
  mintAddress,
  onBack,
  onStatus,
}) => {
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [field, setField] = useState<"address" | "reason">("address");
  const [action, setAction] = useState<"add" | "remove">("add");

  useInput((input: string, key: Key) => {
    if (key.escape) { onBack(); return; }
    if (key.tab) setField((f) => f === "address" ? "reason" : "address");
    if (input === "a") setAction("add");
    if (input === "r") setAction("remove");
    if (key.return && address) {
      onStatus(
        action === "add"
          ? `Preview: blacklist add ${address.slice(0, 8)}… — run: sss-token blacklist add ${address}`
          : `Preview: blacklist remove ${address.slice(0, 8)}… — run: sss-token blacklist remove ${address}`
      );
    }
    if (key.backspace || key.delete) {
      if (field === "address") setAddress((s) => s.slice(0, -1));
      else setReason((s) => s.slice(0, -1));
      return;
    }
    if (!key.ctrl && !key.meta && input && input.length === 1 && !/[ar]/.test(input)) {
      if (field === "address") setAddress((s) => s + input);
      else setReason((s) => s + input);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1} width={60}>
      <Text bold color="yellow">🚫 Blacklist Management</Text>
      <Text color="gray">Mint: {mintAddress.slice(0, 16)}…</Text>
      <Text> </Text>

      <Box>
        <Text
          bold={action === "add"}
          color={action === "add" ? "green" : "gray"}
        >[a] Add  </Text>
        <Text
          bold={action === "remove"}
          color={action === "remove" ? "red" : "gray"}
        >[r] Remove</Text>
      </Box>
      <Text> </Text>

      <Box flexDirection="column">
        <Text color={field === "address" ? "white" : "gray"}>
          Address: {address || <Text color="gray">wallet or token account…</Text>}
          {field === "address" && <Text color="white">█</Text>}
        </Text>
        {action === "add" && (
          <Text color={field === "reason" ? "white" : "gray"}>
            Reason:  {reason || <Text color="gray">e.g. OFAC match</Text>}
            {field === "reason" && <Text color="white">█</Text>}
          </Text>
        )}
      </Box>
      <Text> </Text>
      <Text color="gray">Tab=switch  Enter=preview  Esc=back</Text>
    </Box>
  );
};
