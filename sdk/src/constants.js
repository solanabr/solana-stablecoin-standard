"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleAction = exports.RoleType = exports.BLACKLIST_SEED = exports.ROLE_SEED = exports.MINTER_SEED = exports.STABLECOIN_SEED = exports.TRANSFER_HOOK_PROGRAM_ID = exports.STABLECOIN_CORE_PROGRAM_ID = void 0;
const web3_js_1 = require("@solana/web3.js");
// Program IDs (update after deployment)
exports.STABLECOIN_CORE_PROGRAM_ID = new web3_js_1.PublicKey('SSS11111111111111111111111111111111111111111');
exports.TRANSFER_HOOK_PROGRAM_ID = new web3_js_1.PublicKey('HOOK1111111111111111111111111111111111111111');
// Seeds for PDA derivation
exports.STABLECOIN_SEED = Buffer.from('stablecoin');
exports.MINTER_SEED = Buffer.from('minter');
exports.ROLE_SEED = Buffer.from('role');
exports.BLACKLIST_SEED = Buffer.from('blacklist');
// Role types
var RoleType;
(function (RoleType) {
    RoleType[RoleType["Burner"] = 0] = "Burner";
    RoleType[RoleType["Blacklister"] = 1] = "Blacklister";
    RoleType[RoleType["Pauser"] = 2] = "Pauser";
    RoleType[RoleType["Seizer"] = 3] = "Seizer";
})(RoleType || (exports.RoleType = RoleType = {}));
// Role actions
var RoleAction;
(function (RoleAction) {
    RoleAction[RoleAction["Add"] = 0] = "Add";
    RoleAction[RoleAction["Remove"] = 1] = "Remove";
})(RoleAction || (exports.RoleAction = RoleAction = {}));
