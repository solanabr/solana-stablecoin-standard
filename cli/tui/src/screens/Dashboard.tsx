import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, Key } from "ink";
import Spinner from "ink-spinner";
import { Connection, PublicKey } from "@solana/web3.js";
import { Screen } from "../App";

interface DashboardProps {
  connection: Connection;
  mintAddress: string;
  onNavigate: (screen: Screen) => void;
  onMintChange: (mint: string) => void;
  onStatus: (msg: string) => void;
}

interface MintInfo {
  supply: string;
  decimals: number;
  paused: boolean;
  preset: string;
  authority: string;
  minterCount: number;
}

const MENU_ITEMS: { label: string; screen: Screen; color: string }[] = [
  { label: "💰  Mint Tokens", screen: "mint", color: "green" },
  { label: "🔥  Burn Tokens", screen: "burn", color: "red" },
  { label: "🚫  Blacklist Management", screen: "blacklist", color: "yellow" },
  { label: "👥  Minter Management", screen: "minters", color: "blue" },
];

export const Dashboard: React.FC<DashboardProps> = ({
  connection,
  mintAddress,
  onNavigate,
  onStatus,
}) => {
  const [selected, setSelected] = useState(0);
  const [mintInfo, setMintInfo] = useState<MintInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchMintInfo = useCallback(async () => {
    if (!mintAddress) return;
    setLoading(true);
    onStatus("Fetching mint info…");
    try {
      // Fetch supply from Token-2022
      const mintPubkey = new PublicKey(mintAddress);
      const supplyInfo = await connection.getTokenSupply(mintPubkey);
      setMintInfo({
        supply: supplyInfo.value.uiAmountString ?? "0",
        decimals: supplyInfo.value.decimals,
        paused: false,
        preset: "SSS-1/SSS-2",
        authority: "…",
        minterCount: 0,
      });
      onStatus("Ready");
    } catch (e) {
      onStatus(`Error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [mintAddress, connection, onStatus]);

  useEffect(() => {
    fetchMintInfo();
  }, [fetchMintInfo]);

  useInput((input: string, key: Key) => {
    if (key.upArrow) setSelected((s) => Math.max(0, s - 1));
    if (key.downArrow) setSelected((s) => Math.min(MENU_ITEMS.length - 1, s + 1));
    if (key.return) onNavigate(MENU_ITEMS[selected].screen);
    if (input === "r") fetchMintInfo();
  });

  return (
    <Box flexDirection="row">
      {/* Left: Mint info panel */}
      <Box flexDirection="column" width={40} borderStyle="round" borderColor="cyan" padding={1}>
        <Text bold color="cyan">Stablecoin Info</Text>
        <Text> </Text>
        {!mintAddress && (
          <Text color="gray">No mint loaded. Start with:</Text>
        )}
        {!mintAddress && (
          <Text color="gray">  sss-tui --mint &lt;address&gt;</Text>
        )}
        {mintAddress && loading && (
          <Box>
            <Spinner type="dots" />
            <Text> Loading…</Text>
          </Box>
        )}
        {mintAddress && mintInfo && !loading && (
          <>
            <Text>
              <Text color="gray">Mint: </Text>
              <Text>{mintAddress.slice(0, 12)}…</Text>
            </Text>
            <Text>
              <Text color="gray">Supply: </Text>
              <Text color="green" bold>{mintInfo.supply}</Text>
            </Text>
            <Text>
              <Text color="gray">Decimals: </Text>
              <Text>{mintInfo.decimals}</Text>
            </Text>
            <Text>
              <Text color="gray">Status: </Text>
              <Text color={mintInfo.paused ? "red" : "green"}>
                {mintInfo.paused ? "⏸ PAUSED" : "▶ ACTIVE"}
              </Text>
            </Text>
          </>
        )}
      </Box>

      {/* Right: Navigation menu */}
      <Box flexDirection="column" width={35} borderStyle="round" borderColor="blue" padding={1}>
        <Text bold color="blue">Operations</Text>
        <Text> </Text>
        {MENU_ITEMS.map((item, i) => (
          <Box key={item.screen}>
            <Text
              color={i === selected ? "white" : item.color}
              bold={i === selected}
            >
              {i === selected ? "▶ " : "  "}
              {item.label}
            </Text>
          </Box>
        ))}
        <Text> </Text>
        <Text color="gray">↑/↓ navigate  Enter select</Text>
      </Box>
    </Box>
  );
};
