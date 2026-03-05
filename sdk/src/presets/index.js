"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Presets = exports.SSS2_CONFIG = exports.SSS1_CONFIG = exports.Preset = void 0;
exports.resolvePreset = resolvePreset;
var Preset;
(function (Preset) {
    Preset["SSS_1"] = "sss-1";
    Preset["SSS_2"] = "sss-2";
    Preset["CUSTOM"] = "custom";
})(Preset || (exports.Preset = Preset = {}));
exports.SSS1_CONFIG = {
    decimals: 6,
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
};
exports.SSS2_CONFIG = {
    decimals: 6,
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: false,
};
function resolvePreset(preset, overrides = {}) {
    switch (preset) {
        case Preset.SSS_1:
            return { ...exports.SSS1_CONFIG, ...overrides };
        case Preset.SSS_2:
            return { ...exports.SSS2_CONFIG, ...overrides };
        case Preset.CUSTOM:
            return overrides;
    }
}
// Alias for ergonomic API
exports.Presets = Preset;
