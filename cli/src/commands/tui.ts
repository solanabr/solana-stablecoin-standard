import { Command } from "commander";
import React from 'react';
import { render } from 'ink';
import { Dashboard } from "../tui/Dashboard";
import { getConfig } from "../config";
import { StablecoinSDK } from "../../../sdk/src/index";
import { PublicKey } from "@solana/web3.js";

export function registerTuiCommand(program: Command) {
    program
        .command("dashboard")
        .alias("tui")
        .description("Open interactive terminal UI (God Mode)")
        .requiredOption("-m, --mint <address>", "The Mint Address of the stablecoin")
        .action(async (options) => {
            try {
                const config = getConfig();
                const sdk = new StablecoinSDK(
                    config.connection, 
                    config.adminKeypair, 
                    config.programId, 
                    config.hookId
                );

                // Очищаем консоль перед запуском
                console.clear();

                // Рендерим React приложение прямо в терминале!
                render(React.createElement(Dashboard, { 
                    sdk, 
                    mintAddress: options.mint 
                }));

            } catch (error: any) {
                console.error("Failed to launch dashboard:", error.message);
            }
        });
}