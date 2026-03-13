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
exports.registerAuditCommand = registerAuditCommand;
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const fs = __importStar(require("fs"));
const config_1 = require("../config");
const index_1 = require("../../../sdk/src/index");
const web3_js_1 = require("@solana/web3.js");
function registerAuditCommand(program) {
    program
        .command("audit-log")
        .description("Export audit trail of stablecoin operations")
        .requiredOption("-m, --mint <address>", "The Mint Address of the stablecoin")
        .option("-a, --action <type>", "Filter by action (mint, burn, seized, blacklisted)", "all")
        .option("--export <format>", "Export format (csv)", "csv")
        .action(async (options) => {
        const spinner = (0, ora_1.default)("Scanning blockchain for audit events...").start();
        try {
            const config = (0, config_1.getConfig)();
            const sdk = new index_1.StablecoinSDK(config.connection, config.adminKeypair, config.programId, config.hookId);
            const mintAddress = new web3_js_1.PublicKey(options.mint);
            // Ищем PDA конфига, так как большинство транзакций взаимодействуют с ним
            const [configPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("config")], sdk.program.programId);
            // 1. Получаем историю транзакций (последние 100 для демо)
            const signatures = await sdk.connection.getSignaturesForAddress(configPda, { limit: 100 });
            const auditRecords = [];
            // 2. Парсим транзакции в поисках Anchor Events
            for (const sigInfo of signatures) {
                const txDetails = await sdk.connection.getTransaction(sigInfo.signature, {
                    commitment: "confirmed",
                    maxSupportedTransactionVersion: 0,
                });
                if (!txDetails || !txDetails.meta || !txDetails.meta.logMessages)
                    continue;
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
                        date: new Date(txDetails.blockTime * 1000).toISOString(),
                        action: event.name,
                        wallet: (event.data.to || event.data.from || event.data.wallet || "N/A").toString(),
                        amount: event.data.amount ? (Number(event.data.amount) / 10 ** 6).toString() : "N/A",
                        txHash: sigInfo.signature,
                    });
                }
            }
            spinner.stop();
            if (auditRecords.length === 0) {
                console.log(chalk_1.default.yellow("No audit events found for this token."));
                return;
            }
            // 3. Красивая ASCII таблица (Wow-фича)
            const table = new cli_table3_1.default({
                head: [chalk_1.default.cyan('Date'), chalk_1.default.cyan('Action'), chalk_1.default.cyan('Wallet'), chalk_1.default.cyan('Amount'), chalk_1.default.cyan('TxHash')],
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
                console.log(chalk_1.default.green(`\n📄 Audit trail successfully exported to: `) + chalk_1.default.bold(filename));
            }
        }
        catch (error) {
            spinner.fail(chalk_1.default.red("Failed to fetch audit log"));
            console.error(chalk_1.default.red(error.message));
        }
    });
}
//# sourceMappingURL=audit.js.map