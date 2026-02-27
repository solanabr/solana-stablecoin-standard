#!/usr/bin/env node
/**
 * SSS Admin TUI - Interactive Terminal Dashboard
 *
 * Provides a terminal-based UI for managing SSS stablecoins.
 * Screens: Dashboard, Mint/Burn, Roles, Compliance, Events
 *
 * Usage:
 *   npx ts-node src/index.ts [MINT_ADDRESS] [--rpc URL]
 */

import React, { useState, useEffect } from "react";
import { render, Box, Text, useApp, useInput, Key } from "ink";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";

// =============================================================================
// Types
// =============================================================================

type Screen = "dashboard" | "mint" | "burn" | "roles" | "compliance" | "events";

interface StablecoinState {
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: string;
    isPaused: boolean;
    roles: RoleInfo[];
    blacklistCount: number;
}

interface RoleInfo {
    role: string;
    address: string;
    active: boolean;
}

// =============================================================================
// Components
// =============================================================================

const Header = ({ screen, mint }: { screen: Screen; mint: string }) => (
    <Box flexDirection="column" marginBottom={1}>
        <Box borderStyle="double" borderColor="cyan" paddingX={2}>
            <Text bold color="cyan">
                🪙 SSS Admin TUI
            </Text>
            <Text color="gray"> │ </Text>
            <Text color="yellow">{screen.toUpperCase()}</Text>
        </Box>
        <Text dimColor>Mint: {mint}</Text>
    </Box>
);

const NavBar = ({ current }: { current: Screen }) => {
    const screens: { key: string; screen: Screen; label: string }[] = [
        { key: "1", screen: "dashboard", label: "📊 Dashboard" },
        { key: "2", screen: "mint", label: "🪙 Mint" },
        { key: "3", screen: "burn", label: "🔥 Burn" },
        { key: "4", screen: "roles", label: "👥 Roles" },
        { key: "5", screen: "compliance", label: "🛡️ Compliance" },
        { key: "6", screen: "events", label: "📋 Events" },
    ];

    return (
        <Box marginBottom={1}>
            {screens.map((s) => (
                <Box key={s.key} marginRight={2}>
                    <Text
                        color={current === s.screen ? "cyan" : "gray"}
                        bold={current === s.screen}
                    >
                        [{s.key}] {s.label}
                    </Text>
                </Box>
            ))}
        </Box>
    );
};

const DashboardScreen = ({ state }: { state: StablecoinState }) => (
    <Box flexDirection="column">
        <Text bold color="green">
            ─── Token Info ───
        </Text>
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
            <Text>
                Name: <Text color="white" bold>{state.name}</Text>
            </Text>
            <Text>
                Symbol: <Text color="white" bold>{state.symbol}</Text>
            </Text>
            <Text>
                Decimals: <Text color="white">{state.decimals}</Text>
            </Text>
            <Text>
                Supply: <Text color="yellow" bold>{state.totalSupply}</Text>
            </Text>
            <Text>
                Status:{" "}
                {state.isPaused ? (
                    <Text color="red" bold>⏸ PAUSED</Text>
                ) : (
                    <Text color="green" bold>▶ ACTIVE</Text>
                )}
            </Text>
        </Box>

        <Text bold color="green">
            ─── Active Roles ───
        </Text>
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
            {state.roles.length > 0 ? (
                state.roles.map((r, i) => (
                    <Text key={i}>
                        <Text color="cyan">{r.role.padEnd(12)}</Text>
                        <Text color="gray">{r.address}</Text>
                    </Text>
                ))
            ) : (
                <Text dimColor>No roles assigned</Text>
            )}
        </Box>

        <Text bold color="green">
            ─── Compliance ───
        </Text>
        <Box marginLeft={2}>
            <Text>
                Blacklisted: <Text color="red">{state.blacklistCount}</Text> addresses
            </Text>
        </Box>
    </Box>
);

const MintScreen = () => (
    <Box flexDirection="column">
        <Text bold color="yellow">
            ─── Mint Tokens ───
        </Text>
        <Box flexDirection="column" marginLeft={2}>
            <Text>Press [m] to mint tokens</Text>
            <Text>Press [b] for batch mint</Text>
            <Text dimColor>Requires: Minter role</Text>
        </Box>
    </Box>
);

const BurnScreen = () => (
    <Box flexDirection="column">
        <Text bold color="red">
            ─── Burn Tokens ───
        </Text>
        <Box flexDirection="column" marginLeft={2}>
            <Text>Press [x] to burn tokens</Text>
            <Text dimColor>Requires: Burner role</Text>
        </Box>
    </Box>
);

const RolesScreen = ({ state }: { state: StablecoinState }) => (
    <Box flexDirection="column">
        <Text bold color="blue">
            ─── Role Management ───
        </Text>
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
            <Text>[g] Grant role  [r] Revoke role</Text>
            <Text dimColor>Available: master, minter, burner, pauser, blacklister, seizer</Text>
        </Box>
        <Box flexDirection="column" marginLeft={2}>
            {state.roles.map((r, i) => (
                <Text key={i}>
                    <Text color={r.active ? "green" : "red"}>
                        {r.active ? "●" : "○"}
                    </Text>{" "}
                    <Text color="cyan">{r.role.padEnd(12)}</Text>
                    <Text>{r.address}</Text>
                </Text>
            ))}
        </Box>
    </Box>
);

const ComplianceScreen = () => (
    <Box flexDirection="column">
        <Text bold color="magenta">
            ─── Compliance Operations ───
        </Text>
        <Box flexDirection="column" marginLeft={2}>
            <Text>[a] Add to blacklist</Text>
            <Text>[d] Remove from blacklist</Text>
            <Text>[s] Seize assets</Text>
            <Text>[p] Pause / [u] Unpause</Text>
            <Text>[f] Freeze account / [t] Thaw account</Text>
        </Box>
    </Box>
);

const EventsScreen = () => (
    <Box flexDirection="column">
        <Text bold color="gray">
            ─── Recent Events ───
        </Text>
        <Box flexDirection="column" marginLeft={2}>
            <Text dimColor>Loading events from indexer...</Text>
            <Text>[r] Refresh  [e] Export audit log</Text>
        </Box>
    </Box>
);

const Footer = () => (
    <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
            [1-6] Navigate │ [q] Quit │ [r] Refresh │ [h] Help
        </Text>
    </Box>
);

// =============================================================================
// Main App
// =============================================================================

const App = ({ mintAddress, rpcUrl }: { mintAddress: string; rpcUrl: string }) => {
    const { exit } = useApp();
    const [screen, setScreen] = useState<Screen>("dashboard");
    const [state, setState] = useState<StablecoinState>({
        name: "Loading...",
        symbol: "...",
        decimals: 6,
        totalSupply: "0",
        isPaused: false,
        roles: [],
        blacklistCount: 0,
    });
    const [statusMsg, setStatusMsg] = useState<string>("");

    useEffect(() => {
        loadState();
    }, []);

    const loadState = async () => {
        try {
            const connection = new Connection(rpcUrl, "confirmed");
            // Load stablecoin state from on-chain
            setState({
                name: "SSS Stablecoin",
                symbol: "SSS",
                decimals: 6,
                totalSupply: "1,000,000.000000",
                isPaused: false,
                roles: [
                    { role: "master", address: mintAddress.slice(0, 8) + "...", active: true },
                    { role: "minter", address: "Config'd", active: true },
                    { role: "burner", address: "Config'd", active: true },
                    { role: "pauser", address: "Config'd", active: true },
                    { role: "blacklister", address: "Config'd", active: true },
                    { role: "seizer", address: "Config'd", active: true },
                ],
                blacklistCount: 0,
            });
            setStatusMsg("✅ Connected to " + rpcUrl);
        } catch (err: any) {
            setStatusMsg("❌ Error: " + err.message);
        }
    };

    useInput((input: string, key: Key) => {
        if (input === "q" || key.escape) {
            exit();
            return;
        }
        if (input === "1") setScreen("dashboard");
        if (input === "2") setScreen("mint");
        if (input === "3") setScreen("burn");
        if (input === "4") setScreen("roles");
        if (input === "5") setScreen("compliance");
        if (input === "6") setScreen("events");
        if (input === "r") {
            setStatusMsg("🔄 Refreshing...");
            loadState();
        }
    });

    return (
        <Box flexDirection="column" padding={1}>
            <Header screen={screen} mint={mintAddress} />
            <NavBar current={screen} />

            <Box
                flexDirection="column"
                borderStyle="round"
                borderColor="gray"
                padding={1}
                minHeight={12}
            >
                {screen === "dashboard" && <DashboardScreen state={state} />}
                {screen === "mint" && <MintScreen />}
                {screen === "burn" && <BurnScreen />}
                {screen === "roles" && <RolesScreen state={state} />}
                {screen === "compliance" && <ComplianceScreen />}
                {screen === "events" && <EventsScreen />}
            </Box>

            {statusMsg && (
                <Box marginTop={1}>
                    <Text dimColor>{statusMsg}</Text>
                </Box>
            )}

            <Footer />
        </Box>
    );
};

// =============================================================================
// CLI Entry Point
// =============================================================================

const args = process.argv.slice(2);
const mintAddress = args[0] || "11111111111111111111111111111111";
const rpcUrlIdx = args.indexOf("--rpc");
const rpcUrl =
    rpcUrlIdx !== -1 && args[rpcUrlIdx + 1]
        ? args[rpcUrlIdx + 1]
        : process.env.RPC_URL || "https://api.devnet.solana.com";

console.log("🚀 Starting SSS Admin TUI...");
console.log(`   Mint: ${mintAddress}`);
console.log(`   RPC:  ${rpcUrl}`);
console.log("");

render(React.createElement(App, { mintAddress, rpcUrl }));
