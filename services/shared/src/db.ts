import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

let pool: Pool | null = null;

export function createPool(databaseUrl: string): Pool {
  pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on("error", (err) => {
    console.error("PostgreSQL pool error", err);
  });

  return pool;
}

export function getPool(): Pool {
  if (!pool) throw new Error("DB pool not initialized. Call createPool first.");
  return pool;
}

export async function query<R extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<QueryResult<R>> {
  return getPool().query<R>(sql, params as unknown[]);
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDbHealth(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
