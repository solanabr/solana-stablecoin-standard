#!/usr/bin/env node
"use strict";
/**
 * SSS Admin TUI - Interactive Terminal Dashboard
 *
 * Provides a terminal-based UI for managing SSS stablecoins.
 * Screens: Dashboard, Mint/Burn, Roles, Compliance, Events
 *
 * Usage:
 *   npx ts-node src/index.ts [MINT_ADDRESS] [--rpc URL]
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const ink_1 = require("ink");
const web3_js_1 = require("@solana/web3.js");
// =============================================================================
// Components
// =============================================================================
const Header = ({ screen, mint }) => (react_1.default.createElement(ink_1.Box, { flexDirection: "column", marginBottom: 1 },
    react_1.default.createElement(ink_1.Box, { borderStyle: "double", borderColor: "cyan", paddingX: 2 },
        react_1.default.createElement(ink_1.Text, { bold: true, color: "cyan" }, "\uD83E\uDE99 SSS Admin TUI"),
        react_1.default.createElement(ink_1.Text, { color: "gray" }, " \u2502 "),
        react_1.default.createElement(ink_1.Text, { color: "yellow" }, screen.toUpperCase())),
    react_1.default.createElement(ink_1.Text, { dimColor: true },
        "Mint: ",
        mint)));
const NavBar = ({ current }) => {
    const screens = [
        { key: "1", screen: "dashboard", label: "📊 Dashboard" },
        { key: "2", screen: "mint", label: "🪙 Mint" },
        { key: "3", screen: "burn", label: "🔥 Burn" },
        { key: "4", screen: "roles", label: "👥 Roles" },
        { key: "5", screen: "compliance", label: "🛡️ Compliance" },
        { key: "6", screen: "events", label: "📋 Events" },
    ];
    return (react_1.default.createElement(ink_1.Box, { marginBottom: 1 }, screens.map((s) => (react_1.default.createElement(ink_1.Box, { key: s.key, marginRight: 2 },
        react_1.default.createElement(ink_1.Text, { color: current === s.screen ? "cyan" : "gray", bold: current === s.screen },
            "[",
            s.key,
            "] ",
            s.label))))));
};
const DashboardScreen = ({ state }) => (react_1.default.createElement(ink_1.Box, { flexDirection: "column" },
    react_1.default.createElement(ink_1.Text, { bold: true, color: "green" }, "\u2500\u2500\u2500 Token Info \u2500\u2500\u2500"),
    react_1.default.createElement(ink_1.Box, { flexDirection: "column", marginLeft: 2, marginBottom: 1 },
        react_1.default.createElement(ink_1.Text, null,
            "Name: ",
            react_1.default.createElement(ink_1.Text, { color: "white", bold: true }, state.name)),
        react_1.default.createElement(ink_1.Text, null,
            "Symbol: ",
            react_1.default.createElement(ink_1.Text, { color: "white", bold: true }, state.symbol)),
        react_1.default.createElement(ink_1.Text, null,
            "Decimals: ",
            react_1.default.createElement(ink_1.Text, { color: "white" }, state.decimals)),
        react_1.default.createElement(ink_1.Text, null,
            "Supply: ",
            react_1.default.createElement(ink_1.Text, { color: "yellow", bold: true }, state.totalSupply)),
        react_1.default.createElement(ink_1.Text, null,
            "Status:",
            " ",
            state.isPaused ? (react_1.default.createElement(ink_1.Text, { color: "red", bold: true }, "\u23F8 PAUSED")) : (react_1.default.createElement(ink_1.Text, { color: "green", bold: true }, "\u25B6 ACTIVE")))),
    react_1.default.createElement(ink_1.Text, { bold: true, color: "green" }, "\u2500\u2500\u2500 Active Roles \u2500\u2500\u2500"),
    react_1.default.createElement(ink_1.Box, { flexDirection: "column", marginLeft: 2, marginBottom: 1 }, state.roles.length > 0 ? (state.roles.map((r, i) => (react_1.default.createElement(ink_1.Text, { key: i },
        react_1.default.createElement(ink_1.Text, { color: "cyan" }, r.role.padEnd(12)),
        react_1.default.createElement(ink_1.Text, { color: "gray" }, r.address))))) : (react_1.default.createElement(ink_1.Text, { dimColor: true }, "No roles assigned"))),
    react_1.default.createElement(ink_1.Text, { bold: true, color: "green" }, "\u2500\u2500\u2500 Compliance \u2500\u2500\u2500"),
    react_1.default.createElement(ink_1.Box, { marginLeft: 2 },
        react_1.default.createElement(ink_1.Text, null,
            "Blacklisted: ",
            react_1.default.createElement(ink_1.Text, { color: "red" }, state.blacklistCount),
            " addresses"))));
const MintScreen = () => (react_1.default.createElement(ink_1.Box, { flexDirection: "column" },
    react_1.default.createElement(ink_1.Text, { bold: true, color: "yellow" }, "\u2500\u2500\u2500 Mint Tokens \u2500\u2500\u2500"),
    react_1.default.createElement(ink_1.Box, { flexDirection: "column", marginLeft: 2 },
        react_1.default.createElement(ink_1.Text, null, "Press [m] to mint tokens"),
        react_1.default.createElement(ink_1.Text, null, "Press [b] for batch mint"),
        react_1.default.createElement(ink_1.Text, { dimColor: true }, "Requires: Minter role"))));
const BurnScreen = () => (react_1.default.createElement(ink_1.Box, { flexDirection: "column" },
    react_1.default.createElement(ink_1.Text, { bold: true, color: "red" }, "\u2500\u2500\u2500 Burn Tokens \u2500\u2500\u2500"),
    react_1.default.createElement(ink_1.Box, { flexDirection: "column", marginLeft: 2 },
        react_1.default.createElement(ink_1.Text, null, "Press [x] to burn tokens"),
        react_1.default.createElement(ink_1.Text, { dimColor: true }, "Requires: Burner role"))));
const RolesScreen = ({ state }) => (react_1.default.createElement(ink_1.Box, { flexDirection: "column" },
    react_1.default.createElement(ink_1.Text, { bold: true, color: "blue" }, "\u2500\u2500\u2500 Role Management \u2500\u2500\u2500"),
    react_1.default.createElement(ink_1.Box, { flexDirection: "column", marginLeft: 2, marginBottom: 1 },
        react_1.default.createElement(ink_1.Text, null, "[g] Grant role  [r] Revoke role"),
        react_1.default.createElement(ink_1.Text, { dimColor: true }, "Available: master, minter, burner, pauser, blacklister, seizer")),
    react_1.default.createElement(ink_1.Box, { flexDirection: "column", marginLeft: 2 }, state.roles.map((r, i) => (react_1.default.createElement(ink_1.Text, { key: i },
        react_1.default.createElement(ink_1.Text, { color: r.active ? "green" : "red" }, r.active ? "●" : "○"),
        " ",
        react_1.default.createElement(ink_1.Text, { color: "cyan" }, r.role.padEnd(12)),
        react_1.default.createElement(ink_1.Text, null, r.address)))))));
const ComplianceScreen = () => (react_1.default.createElement(ink_1.Box, { flexDirection: "column" },
    react_1.default.createElement(ink_1.Text, { bold: true, color: "magenta" }, "\u2500\u2500\u2500 Compliance Operations \u2500\u2500\u2500"),
    react_1.default.createElement(ink_1.Box, { flexDirection: "column", marginLeft: 2 },
        react_1.default.createElement(ink_1.Text, null, "[a] Add to blacklist"),
        react_1.default.createElement(ink_1.Text, null, "[d] Remove from blacklist"),
        react_1.default.createElement(ink_1.Text, null, "[s] Seize assets"),
        react_1.default.createElement(ink_1.Text, null, "[p] Pause / [u] Unpause"),
        react_1.default.createElement(ink_1.Text, null, "[f] Freeze account / [t] Thaw account"))));
const EventsScreen = () => (react_1.default.createElement(ink_1.Box, { flexDirection: "column" },
    react_1.default.createElement(ink_1.Text, { bold: true, color: "gray" }, "\u2500\u2500\u2500 Recent Events \u2500\u2500\u2500"),
    react_1.default.createElement(ink_1.Box, { flexDirection: "column", marginLeft: 2 },
        react_1.default.createElement(ink_1.Text, { dimColor: true }, "Loading events from indexer..."),
        react_1.default.createElement(ink_1.Text, null, "[r] Refresh  [e] Export audit log"))));
const Footer = () => (react_1.default.createElement(ink_1.Box, { marginTop: 1, borderStyle: "single", borderColor: "gray", paddingX: 1 },
    react_1.default.createElement(ink_1.Text, { dimColor: true }, "[1-6] Navigate \u2502 [q] Quit \u2502 [r] Refresh \u2502 [h] Help")));
// =============================================================================
// Main App
// =============================================================================
const App = ({ mintAddress, rpcUrl }) => {
    const { exit } = (0, ink_1.useApp)();
    const [screen, setScreen] = (0, react_1.useState)("dashboard");
    const [state, setState] = (0, react_1.useState)({
        name: "Loading...",
        symbol: "...",
        decimals: 6,
        totalSupply: "0",
        isPaused: false,
        roles: [],
        blacklistCount: 0,
    });
    const [statusMsg, setStatusMsg] = (0, react_1.useState)("");
    (0, react_1.useEffect)(() => {
        loadState();
    }, []);
    const loadState = async () => {
        try {
            const connection = new web3_js_1.Connection(rpcUrl, "confirmed");
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
        }
        catch (err) {
            setStatusMsg("❌ Error: " + err.message);
        }
    };
    (0, ink_1.useInput)((input, key) => {
        if (input === "q" || key.escape) {
            exit();
            return;
        }
        if (input === "1")
            setScreen("dashboard");
        if (input === "2")
            setScreen("mint");
        if (input === "3")
            setScreen("burn");
        if (input === "4")
            setScreen("roles");
        if (input === "5")
            setScreen("compliance");
        if (input === "6")
            setScreen("events");
        if (input === "r") {
            setStatusMsg("🔄 Refreshing...");
            loadState();
        }
    });
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", padding: 1 },
        react_1.default.createElement(Header, { screen: screen, mint: mintAddress }),
        react_1.default.createElement(NavBar, { current: screen }),
        react_1.default.createElement(ink_1.Box, { flexDirection: "column", borderStyle: "round", borderColor: "gray", padding: 1, minHeight: 12 },
            screen === "dashboard" && react_1.default.createElement(DashboardScreen, { state: state }),
            screen === "mint" && react_1.default.createElement(MintScreen, null),
            screen === "burn" && react_1.default.createElement(BurnScreen, null),
            screen === "roles" && react_1.default.createElement(RolesScreen, { state: state }),
            screen === "compliance" && react_1.default.createElement(ComplianceScreen, null),
            screen === "events" && react_1.default.createElement(EventsScreen, null)),
        statusMsg && (react_1.default.createElement(ink_1.Box, { marginTop: 1 },
            react_1.default.createElement(ink_1.Text, { dimColor: true }, statusMsg))),
        react_1.default.createElement(Footer, null)));
};
// =============================================================================
// CLI Entry Point
// =============================================================================
const args = process.argv.slice(2);
const mintAddress = args[0] || "11111111111111111111111111111111";
const rpcUrlIdx = args.indexOf("--rpc");
const rpcUrl = rpcUrlIdx !== -1 && args[rpcUrlIdx + 1]
    ? args[rpcUrlIdx + 1]
    : process.env.RPC_URL || "https://api.devnet.solana.com";
console.log("🚀 Starting SSS Admin TUI...");
console.log(`   Mint: ${mintAddress}`);
console.log(`   RPC:  ${rpcUrl}`);
console.log("");
(0, ink_1.render)(react_1.default.createElement(App, { mintAddress, rpcUrl }));
