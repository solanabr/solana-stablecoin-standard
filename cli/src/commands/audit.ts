import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import * as fs from "fs";
import { getConfig } from "../config";
import { StablecoinSDK } from "../../../sdk/src/index";
import { PublicKey } from "@solana/web3.js";

export function registerAuditCommand(program: Command) {
    program
        .command("audit-log")
        .description("Export audit trail of stablecoin operations")
        .requiredOption("-m, --mint <address>", "The Mint Address of the stablecoin")
        .option("-a, --action <type>", "Filter by action (mint, burn, seized, blacklisted)", "all")
        .option("--export <format>", "Export format (csv)", "csv")
        .action(async (options) => {
            const spinner = ora("Scanning blockchain for audit events...").start();
            try {
                const config = getConfig();
                const sdk = new StablecoinSDK(
                    config.connection,
                    config.adminKeypair,
                    config.programId,
                    config.hookId
                );

                const mintAddress = new PublicKey(options.mint);
                // Ищем PDA конфига, так как большинство транзакций взаимодействуют с ним
                const [configPda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("config")],
                    sdk.program.programId
                );

                // 1. Получаем историю транзакций (последние 100 для демо)
                const signatures = await sdk.connection.getSignaturesForAddress(configPda, { limit: 100 });
                
                const auditRecords: any[] = [];

                // 2. Парсим транзакции в поисках Anchor Events
                for (const sigInfo of signatures) {
                    const txDetails = await sdk.connection.getTransaction(sigInfo.signature, {
                        commitment: "confirmed",
                        maxSupportedTransactionVersion: 0,
                    });

                    if (!txDetails || !txDetails.meta || !txDetails.meta.logMessages) continue;

                    // Используем встроенный парсер Anchor для извлечения событий из логов!
                    const eventParser = new (require('@coral-xyz/anchor').EventParser)(sdk.program.programId, sdk.program.coder);
                    
                    const events = eventParser.parseLogs(txDetails.meta.logMessages);
                    
                    for (let event of events) {
                        // Фильтрация по экшену
                        const eventName = event.name.toLowerCase();
                        if (options.action !== "all" && !eventName.includes(options.action.toLowerCase())) {
                            continue;
                        }

                        auditRecords.push({
                            date: new Date(txDetails.blockTime! * 1000).toISOString(),
                            action: event.name,
                            wallet: (event.data.to || event.data.from || event.data.wallet || "N/A").toString(),
                            amount: event.data.amount ? (Number(event.data.amount) / 10**6).toString() : "N/A",
                            txHash: sigInfo.signature,
                        });
                    }
                }

                spinner.stop();

                if (auditRecords.length === 0) {
                    console.log(chalk.yellow("No audit events found for this token."));
                    return;
                }

                // 3. Красивая ASCII таблица (Wow-фича)
                const table = new Table({
                    head: [chalk.cyan('Date'), chalk.cyan('Action'), chalk.cyan('Wallet'), chalk.cyan('Amount'), chalk.cyan('TxHash')],
                    colWidths: [26, 18, 46, 12, 20]
                });

                auditRecords.forEach(record => {
                    // Форматируем хэш для красоты (первые 8...последние 8)
                    const shortHash = `${record.txHash.slice(0, 8)}...${record.txHash.slice(-8)}`;
                    
                    table.push([
                        record.date,
                        record.action.replace("Event", ""), // Убираем слово Event
                        record.wallet,
                        record.amount,
                        shortHash
                    ]);
                });

                console.log(table.toString());

                // 4. Экспорт в CSV
                if (options.export === "csv") {
                    const csvHeader = "Date,Action,Wallet,Amount,TxHash\n";
                    const csvRows = auditRecords.map(r => `${r.date},${r.action},${r.wallet},${r.amount},${r.txHash}`).join("\n");
                    const filename = `audit_${options.mint.slice(0, 8)}.csv`;
                    
                    fs.writeFileSync(filename, csvHeader + csvRows);
                    console.log(chalk.green(`\n📄 Audit trail successfully exported to: `) + chalk.bold(filename));
                }

            } catch (error: any) {
                spinner.fail(chalk.red("Failed to fetch audit log"));
                console.error(chalk.red(error.message));
            }
        });
}