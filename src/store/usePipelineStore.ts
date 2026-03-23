// src/store/usePipelineStore.ts
import { create } from "zustand";
import { analyzeFile, type AnalyzeFileResult, FileAnalyzeError } from "@/lib/fileparser";
import { analyzeSchema, type ColumnDef, type DatasetProfile } from "@/lib/schemaHeuristics";

// Optional: replace these with your real imported types later
type KPIResult = any;
type TrendPoint = any;
type CategoryPoint = any;
type ExecutiveSummary = any;

type PipelineState = {
  currentView: "LANDING" | "APP";

  rawFile: File | null;
  fileMeta: {
    fileName: string;
    fileSizeMB: number;
    rowCountEstimate: number;
  } | null;

  headers: string[];
  sampleRows: Record<string, string>[];
  isProcessingSchema: boolean;
  parseError: string | null;

  schemaProfile: DatasetProfile | null;
  confirmedSchema: ColumnDef[] | null;
  isAwaitingConfirmation: boolean;

  kpiData: KPIResult | null;
  chartData: {
    trend: TrendPoint[];
    categories: CategoryPoint[];
  } | null;
  isGeneratingLocalData: boolean;
  localError: string | null;

  aiSummary: ExecutiveSummary | null;
  isFetchingAI: boolean;
  aiError: string | null;

  setStartApp: () => void;
  setBackToLanding: () => void;
  ingestFile: (file: File) => Promise<void>;
  runSchemaAnalysis: () => void;
  confirmSchema: (columns: ColumnDef[]) => void;
  generateDashboard: () => Promise<void>;
  resetAll: () => void;
};

export const usePipelineStore = create<PipelineState>((set, get) => ({
  currentView: "LANDING",

  rawFile: null,
  fileMeta: null,

  headers: [],
  sampleRows: [],
  isProcessingSchema: false,
  parseError: null,

  schemaProfile: null,
  confirmedSchema: null,
  isAwaitingConfirmation: false,

  kpiData: null,
  chartData: null,
  isGeneratingLocalData: false,
  localError: null,

  aiSummary: null,
  isFetchingAI: false,
  aiError: null,

  setStartApp: () => set({ currentView: "APP" }),

  setBackToLanding: () =>
    set({
      currentView: "LANDING",
    }),

  ingestFile: async (file: File) => {
    set({
      isProcessingSchema: true,
      parseError: null,
      rawFile: file,

      fileMeta: null,
      headers: [],
      sampleRows: [],
      schemaProfile: null,
      confirmedSchema: null,
      isAwaitingConfirmation: false,

      kpiData: null,
      chartData: null,
      isGeneratingLocalData: false,
      localError: null,

      aiSummary: null,
      isFetchingAI: false,
      aiError: null,
    });

    try {
      const res: AnalyzeFileResult = await analyzeFile(file);

      set({
        fileMeta: {
          fileName: res.fileName,
          fileSizeMB: res.fileSizeMB,
          rowCountEstimate: res.rowCountEstimate,
        },
        headers: res.headers,
        sampleRows: res.sampleRows,
        isProcessingSchema: false,
        parseError: null,
      });
    } catch (e: unknown) {
      const msg =
        e instanceof FileAnalyzeError
          ? e.message
          : e instanceof Error
          ? e.message
          : "Failed to analyze file.";

      set({
        rawFile: null,
        fileMeta: null,
        headers: [],
        sampleRows: [],
        isProcessingSchema: false,
        parseError: msg,
      });
    }
  },

  runSchemaAnalysis: () => {
    const { headers, sampleRows } = get();

    if (!headers.length || sampleRows.length === 0) {
      set({
        parseError: "No sample data available. Please upload a file first.",
      });
      return;
    }

    const profile = analyzeSchema(headers, sampleRows);

    set({
      schemaProfile: profile,
      isAwaitingConfirmation: true,
      parseError: null,
    });
  },

  confirmSchema: (columns: ColumnDef[]) => {
    set({
      confirmedSchema: columns,
      isAwaitingConfirmation: false,
    });
  },

  generateDashboard: async () => {
    const { rawFile, confirmedSchema } = get();

    if (!rawFile || !confirmedSchema || confirmedSchema.length === 0) {
      set({
        localError: "Missing file or confirmed schema. Please re-upload and confirm.",
      });
      return;
    }

    set({
      isGeneratingLocalData: true,
      localError: null,
      kpiData: null,
      chartData: null,
      aiSummary: null,
      isFetchingAI: false,
      aiError: null,
    });

    try {
      // TODO: Replace this stub with your DuckDB + AI pipeline
      await new Promise((resolve) => setTimeout(resolve, 1200));

      set({
        kpiData: { status: "ok", sourceFile: rawFile.name },
        chartData: {
          trend: [],
          categories: [],
        },
        isGeneratingLocalData: false,
      });

      set({ isFetchingAI: true });

      await new Promise((resolve) => setTimeout(resolve, 800));

      set({
        aiSummary: {
          text: `Dashboard generated for ${rawFile.name}`,
        },
        isFetchingAI: false,
      });
    } catch (e: unknown) {
      set({
        localError: e instanceof Error ? e.message : "Dashboard generation failed.",
        isGeneratingLocalData: false,
        isFetchingAI: false,
      });
    }
  },

  resetAll: () =>
    set({
      currentView: "LANDING",

      rawFile: null,
      fileMeta: null,

      headers: [],
      sampleRows: [],
      isProcessingSchema: false,
      parseError: null,

      schemaProfile: null,
      confirmedSchema: null,
      isAwaitingConfirmation: false,

      kpiData: null,
      chartData: null,
      isGeneratingLocalData: false,
      localError: null,

      aiSummary: null,
      isFetchingAI: false,
      aiError: null,
    }),
}));
