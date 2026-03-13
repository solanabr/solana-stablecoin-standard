export enum Presets {
    SSS_1 = "sss-1",
    SSS_2 = "sss-2"
}

export interface StablecoinConfigParams {
    name: string;
    symbol: string;
    uri: string;
    decimals: number;
    enablePermanentDelegate?: boolean;
    enableTransferHook?: boolean;
    defaultAccountFrozen?: boolean;
}

export function getConfigForPreset(preset: Presets, base: Omit<StablecoinConfigParams, 'enablePermanentDelegate' | 'enableTransferHook' | 'defaultAccountFrozen'>): StablecoinConfigParams {
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
