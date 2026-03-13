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
exports.getConfig = getConfig;
const web3_js_1 = require("@solana/web3.js");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Загружаем .env из папки cli
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
function getConfig() {
    const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8899";
    const programId = process.env.PROGRAM_ID;
    const hookId = process.env.HOOK_PROGRAM_ID;
    let keypairPath = process.env.KEYPAIR_PATH || "~/.config/solana/id.json";
    if (keypairPath.startsWith("~")) {
        keypairPath = path_1.default.join(os.homedir(), keypairPath.slice(1));
    }
    if (!fs.existsSync(keypairPath)) {
        throw new Error(`Keypair not found at ${keypairPath}. Please generate one using 'solana-keygen new'.`);
    }
    const secretKeyString = fs.readFileSync(keypairPath, "utf8");
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    const adminKeypair = web3_js_1.Keypair.fromSecretKey(secretKey);
    const connection = new web3_js_1.Connection(rpcUrl, "confirmed");
    return {
        connection,
        adminKeypair,
        programId: programId,
        hookId: hookId
    };
}
//# sourceMappingURL=config.js.map