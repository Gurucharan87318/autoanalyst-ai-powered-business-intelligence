// lib/db.ts
import * as duckdb from "@duckdb/duckdb-wasm";

type DbState = {
  db: duckdb.AsyncDuckDB;
  conn: duckdb.AsyncDuckDBConnection;
};

let statePromise: Promise<DbState> | null = null;

async function initDuckDB(): Promise<DbState> {
  // Select the best available bundle for the current browser. [web:31]
  const bundles = duckdb.getJsDelivrBundles(); // CDN bundles (works well in Vite/Web). [web:31][web:33]
  const bundle = await duckdb.selectBundle(bundles); // picks mvp/eh + pthread if supported. [web:31][web:33]

  if (!bundle.mainWorker || !bundle.mainModule) {
    throw new Error("DuckDB-WASM bundle selection failed (missing worker/module).");
  }

  // Create a Worker via Blob wrapper to avoid CORS/module-worker issues in some setups. [web:31][web:33]
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" })
  );

  let worker: Worker | null = null;
  try {
    worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger(); // swap to VoidLogger if you want silence
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker); // pthreadWorker optional. [web:33]
    const conn = await db.connect(); // AsyncDuckDBConnection. [web:42]
    return { db, conn };
  } catch (e) {
    worker?.terminate();
    throw e;
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
}

/**
 * Returns an active DuckDB-WASM connection.
 * Safe to call from anywhere; initialization is deduped.
 */
export async function getDbConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!statePromise) statePromise = initDuckDB();
  const { conn } = await statePromise;
  return conn;
}

/**
 * Optional: for ingestion APIs that need access to `db` (registerFileText, etc.). [web:40]
 */
export async function getDbInstance(): Promise<duckdb.AsyncDuckDB> {
  if (!statePromise) statePromise = initDuckDB();
  const { db } = await statePromise;
  return db;
}

/**
 * Optional: allow a hard reset (e.g., on "Clear Workspace").
 */
export async function resetDb(): Promise<void> {
  if (!statePromise) return;
  const { db, conn } = await statePromise;
  try {
    await conn.close();
  } finally {
    // Terminating worker is handled by GC; duckdb-wasm doesn't expose it directly here.
    // Create a new init on next call.
    void db.terminate?.(); // some builds expose terminate; safe optional call
    statePromise = null;
  }
}
