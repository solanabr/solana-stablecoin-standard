interface MintRequest {
    recipient: string;
    amount: string;
    authority?: string;
}
interface MintResult {
    success: boolean;
    signature?: string;
    error?: string;
}
export declare class MintService {
    private connection;
    constructor();
    mint(request: MintRequest): Promise<MintResult>;
    private queueMint;
    getPendingMints(): Promise<any[]>;
}
export {};
