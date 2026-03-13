"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Dashboard = void 0;
const react_1 = __importStar(require("react"));
const ink_1 = require("ink");
const ink_text_input_1 = __importDefault(require("ink-text-input"));
// Исправленный импорт: добавлено .js
const web3_js_1 = require("@solana/web3.js");
const Dashboard = ({ sdk, mintAddress }) => {
    const [supply, setSupply] = (0, react_1.useState)("Loading...");
    const [menuIndex, setMenuIndex] = (0, react_1.useState)(0);
    const [logs, setLogs] = (0, react_1.useState)([]);
    const [inputMode, setInputMode] = (0, react_1.useState)(null);
    const [inputValue, setInputValue] = (0, react_1.useState)("");
    const menuItems = ["Mint Tokens", "Burn Tokens", "Add to Blacklist", "Exit"];
    // Загрузка статистики
    (0, react_1.useEffect)(() => {
        const fetchStats = async () => {
            try {
                const mintInfo = await sdk.connection.getTokenSupply(new web3_js_1.PublicKey(mintAddress));
                setSupply(mintInfo.value.uiAmountString || "0");
                setLogs(prev => [`[INFO] Connected to network`, ...prev].slice(0, 10));
            }
            catch (e) {
                setSupply("Error");
            }
        };
        fetchStats();
        // Симуляция живых логов (для ВАУ эффекта)
        const interval = setInterval(() => {
            fetchStats();
        }, 5000);
        return () => clearInterval(interval);
    }, [mintAddress]);
    // Управление меню (Стрелочки)
    (0, ink_1.useInput)((input, key) => {
        if (inputMode)
            return; // Отключаем навигацию, если мы вводим текст
        if (key.upArrow) {
            setMenuIndex((prev) => Math.max(0, prev - 1));
        }
        if (key.downArrow) {
            setMenuIndex((prev) => Math.min(menuItems.length - 1, prev + 1));
        }
        if (key.return) {
            handleMenuSelect(menuIndex);
        }
    });
    const handleMenuSelect = (index) => {
        if (index === 0)
            setInputMode("mint");
        if (index === 1)
            setInputMode("burn");
        if (index === 2)
            setInputMode("blacklist");
        if (index === 3)
            process.exit(0);
    };
    const handleInputSubmit = async () => {
        const value = inputValue;
        setInputValue("");
        setInputMode(null);
        setLogs(prev => [`[PENDING] Executing ${inputMode}...`, ...prev].slice(0, 10));
        try {
            // Для упрощения демо, минтим/сжигаем со своего же кошелька
            if (inputMode === "mint") {
                await sdk.mint(new web3_js_1.PublicKey(mintAddress), sdk.payer.publicKey, parseInt(value));
                setLogs(prev => [`[SUCCESS] Minted ${value} tokens`, ...prev].slice(0, 10));
            }
            if (inputMode === "burn") {
                await sdk.burn(new web3_js_1.PublicKey(mintAddress), sdk.payer.publicKey, parseInt(value));
                setLogs(prev => [`[SUCCESS] Burned ${value} tokens`, ...prev].slice(0, 10));
            }
            if (inputMode === "blacklist") {
                await sdk.compliance.blacklistAdd(new web3_js_1.PublicKey(value), sdk.hookProgram.programId);
                setLogs(prev => [`[SUCCESS] Blacklisted ${value.slice(0, 8)}...`, ...prev].slice(0, 10));
            }
            // Обновляем сапплай
            const mintInfo = await sdk.connection.getTokenSupply(new web3_js_1.PublicKey(mintAddress));
            setSupply(mintInfo.value.uiAmountString || "0");
        }
        catch (e) {
            setLogs(prev => [`[ERROR] ${e.message.slice(0, 30)}...`, ...prev].slice(0, 10));
        }
    };
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", borderStyle: "double", borderColor: "cyan", padding: 1, width: 80 },
        react_1.default.createElement(ink_1.Box, { borderStyle: "single", borderColor: "green", padding: 1, marginBottom: 1, justifyContent: "space-between" },
            react_1.default.createElement(ink_1.Text, { bold: true, color: "green" }, "\uD83C\uDFE6 SSS-2 God Mode"),
            react_1.default.createElement(ink_1.Text, { color: "yellow" },
                "Mint: ",
                mintAddress.slice(0, 8),
                "... | Supply: ",
                supply)),
        react_1.default.createElement(ink_1.Box, { flexDirection: "row" },
            react_1.default.createElement(ink_1.Box, { flexDirection: "column", width: "40%", borderStyle: "single", borderColor: "blue", padding: 1 },
                react_1.default.createElement(ink_1.Box, { marginBottom: 1 },
                    react_1.default.createElement(ink_1.Text, { bold: true, color: "blue" }, "OPERATIONS")),
                menuItems.map((item, index) => (react_1.default.createElement(ink_1.Text, { key: item, color: index === menuIndex ? "white" : "gray", bold: index === menuIndex },
                    index === menuIndex ? "▶ " : "  ",
                    item)))),
            react_1.default.createElement(ink_1.Box, { flexDirection: "column", width: "60%", borderStyle: "single", borderColor: "magenta", padding: 1 },
                react_1.default.createElement(ink_1.Box, { marginBottom: 1 },
                    react_1.default.createElement(ink_1.Text, { bold: true, color: "magenta" }, "LIVE LOGS")),
                logs.map((log, i) => (react_1.default.createElement(ink_1.Text, { key: i, color: log.includes("ERROR") ? "red" : log.includes("SUCCESS") ? "green" : "white" }, log))))),
        react_1.default.createElement(ink_1.Box, { marginTop: 1 },
            inputMode && (react_1.default.createElement(ink_1.Box, null,
                react_1.default.createElement(ink_1.Text, { color: "cyan" },
                    "Enter ",
                    inputMode === 'blacklist' ? 'address' : 'amount',
                    " for ",
                    inputMode,
                    ":"),
                react_1.default.createElement(ink_1.Box, { marginLeft: 1 },
                    react_1.default.createElement(ink_text_input_1.default, { value: inputValue, onChange: setInputValue, onSubmit: handleInputSubmit })))),
            !inputMode && react_1.default.createElement(ink_1.Text, { color: "gray" }, "Use \u2191/\u2193 arrows to navigate. Press Enter to select."))));
};
exports.Dashboard = Dashboard;
//# sourceMappingURL=Dashboard.js.map