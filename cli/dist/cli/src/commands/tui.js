"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTuiCommand = registerTuiCommand;
const react_1 = __importDefault(require("react"));
const ink_1 = require("ink");
const Dashboard_1 = require("../tui/Dashboard");
const config_1 = require("../config");
const index_1 = require("../../../sdk/src/index");
function registerTuiCommand(program) {
    program
        .command("dashboard")
        .alias("tui")
        .description("Open interactive terminal UI (God Mode)")
        .requiredOption("-m, --mint <address>", "The Mint Address of the stablecoin")
        .action(async (options) => {
        try {
            const config = (0, config_1.getConfig)();
            const sdk = new index_1.StablecoinSDK(config.connection, config.adminKeypair, config.programId, config.hookId);
            // Очищаем консоль перед запуском
            console.clear();
            // Рендерим React приложение прямо в терминале!
            (0, ink_1.render)(react_1.default.createElement(Dashboard_1.Dashboard, {
                sdk,
                mintAddress: options.mint
            }));
        }
        catch (error) {
            console.error("Failed to launch dashboard:", error.message);
        }
    });
}
//# sourceMappingURL=tui.js.map