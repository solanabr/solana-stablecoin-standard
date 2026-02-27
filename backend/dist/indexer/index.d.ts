import "reflect-metadata";
declare class EventIndexer {
    private connection;
    private currentSlot;
    private lastProcessedSignature;
    constructor();
    start(): Promise<void>;
    pollEvents(): Promise<void>;
    processTransaction(signature: string): Promise<void>;
    private parseTransferLog;
    private parseAddressLog;
    private handleTransferEvent;
    private handleFeeUpdateEvent;
    private handleBlacklistAdd;
    private handleWhitelistAdd;
    backfillEvents(): Promise<void>;
}
export default EventIndexer;
