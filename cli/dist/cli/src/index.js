"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const create_1 = require("./commands/create");
const mint_1 = require("./commands/mint");
const burn_1 = require("./commands/burn");
const config_1 = require("./commands/config");
// Новые импорты
const blacklist_1 = require("./commands/blacklist");
const seize_1 = require("./commands/seize");
const tui_1 = require("./commands/tui");
const audit_1 = require("./commands/audit");
const program = new commander_1.Command();
program
    .name("sss-token")
    .description(chalk_1.default.blue("Solana Stablecoin Standard (SSS) CLI Operator Tool"))
    .version("1.0.0");
// Регистрируем все команды
(0, create_1.registerCreateCommand)(program);
(0, mint_1.registerMintCommand)(program);
(0, burn_1.registerBurnCommand)(program);
(0, config_1.registerConfigCommand)(program);
(0, blacklist_1.registerBlacklistCommand)(program);
(0, seize_1.registerSeizeCommand)(program);
(0, tui_1.registerTuiCommand)(program);
(0, audit_1.registerAuditCommand)(program);
program.parse(process.argv);
//# sourceMappingURL=index.js.map