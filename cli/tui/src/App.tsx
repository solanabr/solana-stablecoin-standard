import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp, Key } from "ink";
import { Connection, PublicKey } from "@solana/web3.js";
import { Dashboard } from "./screens/Dashboard";
import { MintScreen } from "./screens/MintScreen";
import { BlacklistScreen } from "./screens/BlacklistScreen";
import { MintersScreen } from "./screens/MintersScreen";
import { Header } from "./components/Header";
import { StatusBar } from "./components/StatusBar";

export type Screen = "dashboard" | "mint" | "burn" | "blacklist" | "minters";

interface AppProps {
  initialMint?: string;
  cluster: string;
}

const CLUSTER_URLS: Record<string, string> = {
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
  mainnet_beta: "https://api.mainnet-beta.solana.com",
  localnet: "http://localhost:8899",
  localhost: "http://localhost:8899",
};

export const App: React.FC<AppProps> = ({ initialMint, cluster }) => {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [mintAddress, setMintAddress] = useState<string>(initialMint ?? "");
  const [connection] = useState(
    () => new Connection(CLUSTER_URLS[cluster] ?? cluster, "confirmed")
  );
  const [statusMsg, setStatusMsg] = useState("Ready");

  useInput((input: string, key: Key) => {
    if (input === "q" && screen === "dashboard") exit();
    if (key.escape || (input === "q" && screen !== "dashboard")) {
      setScreen("dashboard");
    }
  });

  return (
    <Box flexDirection="column" width="100%">
      <Header cluster={cluster} mintAddress={mintAddress} />

      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {screen === "dashboard" && (
          <Dashboard
            connection={connection}
            mintAddress={mintAddress}
            onNavigate={setScreen}
            onMintChange={setMintAddress}
            onStatus={setStatusMsg}
          />
        )}
        {screen === "mint" && (
          <MintScreen
            connection={connection}
            mintAddress={mintAddress}
            onBack={() => setScreen("dashboard")}
            onStatus={setStatusMsg}
          />
        )}
        {screen === "blacklist" && (
          <BlacklistScreen
            connection={connection}
            mintAddress={mintAddress}
            onBack={() => setScreen("dashboard")}
            onStatus={setStatusMsg}
          />
        )}
        {screen === "minters" && (
          <MintersScreen
            connection={connection}
            mintAddress={mintAddress}
            onBack={() => setScreen("dashboard")}
            onStatus={setStatusMsg}
          />
        )}
      </Box>

      <StatusBar message={statusMsg} cluster={cluster} />
    </Box>
  );
};
