import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
// Исправленный импорт: добавлено .js
import { Connection, PublicKey } from '@solana/web3.js'; 
import { StablecoinSDK } from '../../../sdk/src/index';

interface DashboardProps {
    sdk: StablecoinSDK;
    mintAddress: string;
}

export const Dashboard = ({ sdk, mintAddress }: DashboardProps) => {
    const [supply, setSupply] = useState<string>("Loading...");
    const [menuIndex, setMenuIndex] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);
    const [inputMode, setInputMode] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState("");

    const menuItems = ["Mint Tokens", "Burn Tokens", "Add to Blacklist", "Exit"];

    // Загрузка статистики
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const mintInfo = await sdk.connection.getTokenSupply(new PublicKey(mintAddress));
                setSupply(mintInfo.value.uiAmountString || "0");
                
                setLogs(prev => [`[INFO] Connected to network`, ...prev].slice(0, 10));
            } catch (e) {
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
    useInput((input, key) => {
        if (inputMode) return; // Отключаем навигацию, если мы вводим текст

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

    const handleMenuSelect = (index: number) => {
        if (index === 0) setInputMode("mint");
        if (index === 1) setInputMode("burn");
        if (index === 2) setInputMode("blacklist");
        if (index === 3) process.exit(0);
    };

    const handleInputSubmit = async () => {
        const value = inputValue;
        setInputValue("");
        setInputMode(null);

        setLogs(prev => [`[PENDING] Executing ${inputMode}...`, ...prev].slice(0, 10));

        try {
            // Для упрощения демо, минтим/сжигаем со своего же кошелька
            if (inputMode === "mint") {
                await sdk.mint(new PublicKey(mintAddress), sdk.payer.publicKey, parseInt(value));
                setLogs(prev => [`[SUCCESS] Minted ${value} tokens`, ...prev].slice(0, 10));
            }
            if (inputMode === "burn") {
                await sdk.burn(new PublicKey(mintAddress), sdk.payer.publicKey, parseInt(value));
                setLogs(prev => [`[SUCCESS] Burned ${value} tokens`, ...prev].slice(0, 10));
            }
            if (inputMode === "blacklist") {
                await sdk.compliance.blacklistAdd(new PublicKey(value), sdk.hookProgram.programId);
                setLogs(prev => [`[SUCCESS] Blacklisted ${value.slice(0,8)}...`, ...prev].slice(0, 10));
            }
            
            // Обновляем сапплай
            const mintInfo = await sdk.connection.getTokenSupply(new PublicKey(mintAddress));
            setSupply(mintInfo.value.uiAmountString || "0");

        } catch (e: any) {
            setLogs(prev => [`[ERROR] ${e.message.slice(0, 30)}...`, ...prev].slice(0, 10));
        }
    };

    return (
        <Box flexDirection="column" borderStyle="double" borderColor="cyan" padding={1} width={80}>
            {/* HEADER */}
            <Box borderStyle="single" borderColor="green" padding={1} marginBottom={1} justifyContent="space-between">
                <Text bold color="green">🏦 SSS-2 God Mode</Text>
                <Text color="yellow">Mint: {mintAddress.slice(0, 8)}... | Supply: {supply}</Text>
            </Box>

            {/* BODY (Left Menu + Right Logs) */}
            <Box flexDirection="row">
                {/* MENU */}
                <Box flexDirection="column" width="40%" borderStyle="single" borderColor="blue" padding={1}>
                    <Box marginBottom={1}>
                        <Text bold color="blue">OPERATIONS</Text>
                    </Box>
                    {menuItems.map((item, index) => (
                        <Text key={item} color={index === menuIndex ? "white" : "gray"} bold={index === menuIndex}>
                            {index === menuIndex ? "▶ " : "  "}{item}
                        </Text>
                    ))}
                </Box>

                {/* LOGS */}
                <Box flexDirection="column" width="60%" borderStyle="single" borderColor="magenta" padding={1}>
                    <Box marginBottom={1}>
                        <Text bold color="magenta">LIVE LOGS</Text>
                    </Box>
                    
                    {logs.map((log, i) => (
                        <Text key={i} color={log.includes("ERROR") ? "red" : log.includes("SUCCESS") ? "green" : "white"}>
                            {log}
                        </Text>
                    ))}
                </Box>
            </Box>

            {/* INPUT AREA */}
            <Box marginTop={1}>
                {inputMode && (
                    <Box>
                        <Text color="cyan">
                            Enter {inputMode === 'blacklist' ? 'address' : 'amount'} for {inputMode}: 
                        </Text>
                        <Box marginLeft={1}>
                            <TextInput 
                                value={inputValue} 
                                onChange={setInputValue} 
                                onSubmit={handleInputSubmit} 
                            />
                        </Box>
                    </Box>
                )}
                {!inputMode && <Text color="gray">Use ↑/↓ arrows to navigate. Press Enter to select.</Text>}
            </Box>
        </Box>
    );
};