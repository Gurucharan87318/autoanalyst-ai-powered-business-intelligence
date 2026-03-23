// stores/uploadStore.ts
import { create } from "zustand";
import type { ColumnDef } from "../lib/schemaHeuristics";

type UploadState = {
  file: File | null;
  headers: string[];
  detectedSchema: ColumnDef[] | null;
  confirmedSchema: ColumnDef[] | null;

  isParsing: boolean;
  parseError: string | null;
  isConfirmed: boolean;

  setParsing: (v: boolean) => void;
  setParseError: (msg: string | null) => void;

  setFileAndSchema: (payload: { file: File; headers: string[]; detectedSchema: ColumnDef[] }) => void;
  setConfirmedSchema: (schema: ColumnDef[]) => void;
  markConfirmed: (v: boolean) => void;

  reset: () => void;
};

export const useUploadStore = create<UploadState>((set) => ({
  file: null,
  headers: [],
  detectedSchema: null,
  confirmedSchema: null,

  isParsing: false,
  parseError: null,
  isConfirmed: false,

  setParsing: (v) => set({ isParsing: v }),
  setParseError: (msg) => set({ parseError: msg }),

  setFileAndSchema: ({ file, headers, detectedSchema }) =>
    set({
      file,
      headers,
      detectedSchema,
      confirmedSchema: null,
      isConfirmed: false,
      parseError: null,
    }),

  setConfirmedSchema: (schema) => set({ confirmedSchema: schema }),
  markConfirmed: (v) => set({ isConfirmed: v }),

  reset: () =>
    set({
      file: null,
      headers: [],
      detectedSchema: null,
      confirmedSchema: null,
      isParsing: false,
      parseError: null,
      isConfirmed: false,
    }),
}));
