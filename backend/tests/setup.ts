/**
 * Test setup – configures environment variables before any module is imported
 * so that the backend uses a temporary in-memory SQLite database and does not
 * require a running Solana validator.
 */

import path from "path";
import os from "os";
import fs from "fs";

// Use a temporary directory for the test database so we never touch real data.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sss-test-"));
const tmpDbPath = path.join(tmpDir, "test.db");

process.env.DATABASE_PATH = tmpDbPath;
process.env.LOG_LEVEL = "error"; // suppress noisy logs during tests

export { tmpDir, tmpDbPath };
