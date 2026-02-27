interface BurnRequest {
    amount: string;
    authority?: string;
    account?: string;
}
interface BurnResult {
    success: boolean;
    signature?: string;
    error?: string;
}
export declare class BurnService {
    private connection;
    constructor();
    burn(request: BurnRequest): Promise<BurnResult>;
    private queueBurn;
}
export {};
