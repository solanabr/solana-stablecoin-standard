"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Presets = void 0;
exports.getConfigForPreset = getConfigForPreset;
var Presets;
(function (Presets) {
    Presets["SSS_1"] = "sss-1";
    Presets["SSS_2"] = "sss-2";
})(Presets || (exports.Presets = Presets = {}));
function getConfigForPreset(preset, base) {
    switch (preset) {
        case Presets.SSS_1:
            return {
                ...base,
                enablePermanentDelegate: false,
                enableTransferHook: false,
                defaultAccountFrozen: false
            };
        case Presets.SSS_2:
            return {
                ...base,
                enablePermanentDelegate: true,
                enableTransferHook: true,
                defaultAccountFrozen: false
            };
        default:
            throw new Error(`Unknown preset: ${preset}`);
    }
}
