import { Pool } from "pg";
export declare const db: {
    query: (text: string, params?: any[]) => Promise<import("pg").QueryResult<any>>;
    pool: Pool;
};
export declare function initializeDatabase(): Promise<void>;
export default db;
