import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as duckdb from "@duckdb/duckdb-wasm";

import duckdbMvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbEhWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbMvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdbEhWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

type QueryRow = Record<string, unknown>;

type QueryResult = {
  columns: string[];
  rows: QueryRow[];
  rowCount: number;
};

type DatasetShape = {
  columns: string[];
  rows: QueryRow[];
  meta?: {
    name?: string;
  };
} | null;

type UseDuckDBQueryRunnerReturn = {
  isReady: boolean;
  isInitializing: boolean;
  isRunning: boolean;
  error: string | null;
  result: QueryResult | null;
  runQuery: (sql: string) => Promise<QueryResult | null>;
  refreshDatasetTable: () => Promise<void>;
  clearResult: () => void;
};

function toCsv(cols: string[], rows: QueryRow[]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };

  const head = cols.map(esc).join(",");
  const body = rows.map((r) => cols.map((c) => esc(r?.[c])).join(",")).join("\n");
  return `${head}\n${body}`;
}

async function createDuckDB(): Promise<duckdb.AsyncDuckDB> {
  const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
      mainModule: duckdbMvpWasm,
      mainWorker: duckdbMvpWorker,
    },
    eh: {
      mainModule: duckdbEhWasm,
      mainWorker: duckdbEhWorker,
    },
  };

  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}


export function useDuckDBQueryRunner(dataset: DatasetShape): UseDuckDBQueryRunnerReturn {
  const dbRef = useRef<duckdb.AsyncDuckDB | null>(null);
  const connRef = useRef<duckdb.AsyncDuckDBConnection | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);

  const datasetSignature = useMemo(() => {
    if (!dataset) return "no-dataset";
    return JSON.stringify({
      name: dataset.meta?.name ?? "dataset",
      columns: dataset.columns,
      rowCount: dataset.rows.length,
      sample: dataset.rows.slice(0, 3),
    });
  }, [dataset]);

  const ensureInitialized = useCallback(async () => {
    if (dbRef.current && connRef.current) {
      setIsReady(true);
      setIsInitializing(false);
      return;
    }

    if (initPromiseRef.current) {
      await initPromiseRef.current;
      return;
    }

    initPromiseRef.current = (async () => {
      try {
        setIsInitializing(true);
        setError(null);

        if (!dbRef.current) {
          dbRef.current = await createDuckDB();
        }

        if (!connRef.current) {
          connRef.current = await dbRef.current.connect();
        }

        setIsReady(true);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to initialize DuckDB.";
        setError(msg);
        setIsReady(false);
        throw new Error(msg);
      } finally {
        setIsInitializing(false);
      }
    })();

    try {
      await initPromiseRef.current;
    } finally {
      initPromiseRef.current = null;
    }
  }, []);

  const refreshDatasetTable = useCallback(async () => {
    if (!dataset) return;

    await ensureInitialized();

    if (!dbRef.current || !connRef.current) {
      throw new Error("DuckDB connection is not ready.");
    }

    try {
      setError(null);

      const csvText = toCsv(dataset.columns ?? [], dataset.rows ?? []);
      const fileName = "dataset.csv";

      await connRef.current.query(`DROP TABLE IF EXISTS dataset;`);

      try {
        await dbRef.current.dropFile(fileName);
      } catch {}

      await dbRef.current.registerFileText(fileName, csvText);

      await connRef.current.query(`
        CREATE OR REPLACE TABLE dataset AS
        SELECT * FROM read_csv_auto('dataset.csv', HEADER = true);
      `);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to refresh DuckDB dataset table.";
      setError(msg);
      throw new Error(msg);
    }
  }, [dataset, ensureInitialized]);

  const runQuery = useCallback(
    async (sql: string): Promise<QueryResult | null> => {
      try {
        setIsRunning(true);
        setError(null);

        await ensureInitialized();

        if (!connRef.current) {
          throw new Error("DuckDB connection is not ready.");
        }

        const arrowTable = await connRef.current.query(sql);
        const rows = arrowTable.toArray().map((row: any) => ({ ...row })) as QueryRow[];

        const columns =
          arrowTable.schema?.fields?.map((f: any) => String(f.name)) ??
          (rows[0] ? Object.keys(rows[0]) : []);

        const next: QueryResult = {
          columns,
          rows,
          rowCount: rows.length,
        };

        setResult(next);
        return next;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "SQL query failed.";
        setError(msg);
        return null;
      } finally {
        setIsRunning(false);
      }
    },
    [ensureInitialized]
  );

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  useEffect(() => {
    void ensureInitialized();
  }, [ensureInitialized]);

  useEffect(() => {
    if (!dataset) return;
    void refreshDatasetTable();
  }, [datasetSignature, dataset, refreshDatasetTable]);

  useEffect(() => {
    return () => {
      const conn = connRef.current;
      const db = dbRef.current;

      connRef.current = null;
      dbRef.current = null;
      initPromiseRef.current = null;

      void (async () => {
        try {
          await conn?.close();
        } catch {}
        try {
          await db?.terminate();
        } catch {}
      })();
    };
  }, []);

  return {
    isReady,
    isInitializing,
    isRunning,
    error,
    result,
    runQuery,
    refreshDatasetTable,
    clearResult,
  };
}
