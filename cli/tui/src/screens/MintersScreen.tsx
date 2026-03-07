import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, Key } from "ink";
import Spinner from "ink-spinner";
import { Connection, PublicKey } from "@solana/web3.js";

interface MintersScreenProps {
  connection: Connection;
  mintAddress: string;
  onBack: () => void;
  onStatus: (msg: string) => void;
}

interface MinterRow {
  address: string;
  quota: string;
  minted: string;
  active: boolean;
}

export const MintersScreen: React.FC<MintersScreenProps> = ({
  connection,
  mintAddress,
  onBack,
  onStatus,
}) => {
  const [minters, setMinters] = useState<MinterRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMinters = useCallback(async () => {
    if (!mintAddress) return;
    setLoading(true);
    onStatus("Fetching minters…");
    try {
      // In a real implementation this would use getProgramAccounts filtered
      // by the MinterInfo discriminator and mint seed.
      // Here we show a placeholder to demonstrate the TUI layout.
      await new Promise((r) => setTimeout(r, 500));
      setMinters([
        { address: "MinterXXXXXXXXXX", quota: "1,000,000", minted: "250,000", active: true },
        { address: "MinterYYYYYYYYYY", quota: "∞", minted: "0", active: false },
      ]);
      onStatus("Ready — use sss-token minters list for full data");
    } catch (e) {
      onStatus(`Error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [mintAddress, onStatus]);

  useEffect(() => { fetchMinters(); }, [fetchMinters]);

  useInput((input: string, key: Key) => {
    if (key.escape) { onBack(); return; }
    if (input === "r") fetchMinters();
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" padding={1} width={70}>
      <Text bold color="blue">👥 Minter Management</Text>
      <Text color="gray">Mint: {mintAddress.slice(0, 16)}…</Text>
      <Text> </Text>

      {loading ? (
        <Box>
          <Spinner type="dots" />
          <Text> Loading minters…</Text>
        </Box>
      ) : (
        <>
          <Box>
            <Box width={20}><Text bold color="cyan">Address</Text></Box>
            <Box width={14}><Text bold color="cyan">Quota</Text></Box>
            <Box width={14}><Text bold color="cyan">Minted</Text></Box>
            <Box width={8}><Text bold color="cyan">Status</Text></Box>
          </Box>
          <Text color="gray">{"─".repeat(56)}</Text>
          {minters.map((m) => (
            <Box key={m.address}>
              <Box width={20}><Text color="white">{m.address.slice(0, 12)}…</Text></Box>
              <Box width={14}><Text color="green">{m.quota}</Text></Box>
              <Box width={14}><Text color="yellow">{m.minted}</Text></Box>
              <Box width={8}><Text color={m.active ? "green" : "red"}>{m.active ? "✓ active" : "✗ off"}</Text></Box>
            </Box>
          ))}
          {minters.length === 0 && (
            <Text color="gray">No minters found.</Text>
          )}
        </>
      )}

      <Text> </Text>
      <Text color="gray">r=refresh  Esc=back</Text>
    </Box>
  );
};
