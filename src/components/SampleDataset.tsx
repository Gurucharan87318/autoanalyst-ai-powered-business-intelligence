import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSpreadsheet } from "lucide-react";
import { useDatasetStore } from "@/lib_old/DatasetStore";
import Papa from "papaparse";
import { toast } from "sonner";
import { datasetStore } from "@/lib_old/DatasetStore";
import type { DatasetSource } from "@/lib_old/DatasetTypes";

const SAMPLE_DATASETS = [
  {
    name: "Sales Sample",
    filename: "sample-sales.csv",
    rows: 5,
    csv: `Date,Customer,Product,Revenue,Region
2026-01-01,Acme Corp,Widget A,1200,South
2026-01-02,Zen Labs,Widget B,980,North
2026-01-03,Acme Corp,Widget C,1450,South
2026-01-04,Orbit Pvt Ltd,Widget A,2100,West
2026-01-05,Nova Retail,Widget B,760,East`,
  },
  {
    name: "Bank Sample",
    filename: "sample-bank.csv",
    rows: 5,
    csv: `Date,Narration,Debit,Credit,Balance
2026-01-01,Opening Balance,,5000,5000
2026-01-02,Office Supplies,450,,4550
2026-01-03,Client Payment,,1800,6350
2026-01-04,Rent,2500,,3850
2026-01-05,Subscription,299,,3551`,
  },
] as const;

interface SampleDatasetsProps {
  uploading: boolean;
  onDatasetLoaded: () => void;
}

export function SampleDatasets({ uploading, onDatasetLoaded }: SampleDatasetsProps) {
  const loadSample = async (csv: string, filename: string) => {
    try {
      // Parse CSV directly (same as your upload flow)
      const result = await new Promise<any>((resolve, reject) => {
        Papa.parse<Record<string, unknown>>(csv, {
          header: true,
          skipEmptyLines: true,
          complete: resolve,
          error: reject,
        });
      });

      // Build dataset (your existing logic)
      const filtered = (result.data ?? []).filter((row: any) =>
        Object.values(row ?? {}).some((v: any) => String(v ?? "").trim() !== "")
      );

      // Store dataset
      datasetStore.setDataset({
        columns: Object.keys(filtered[0] || {}),
        rows: filtered,
        meta: {
          name: filename,
          rows: filtered.length,
          cols: Object.keys(filtered[0] || {}).length,
          bytes: csv.length,
          createdAt: Date.now(),
          source: "sample" as DatasetSource,
        },
      });
      datasetStore.setSchema(null);

      toast.success(`${filename} loaded — ${filtered.length} rows`);
      onDatasetLoaded();
    } catch (error) {
      toast.error("Failed to load sample dataset");
    }
  };

  return (
    <Card className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-slate-400" />
          <CardTitle className="text-sm font-semibold text-slate-900">
            Try sample datasets
          </CardTitle>
        </div>
        <CardDescription className="text-xs text-slate-500">
          Load demo data to see the full Schema → SQL → Visuals flow instantly.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-2">
        {SAMPLE_DATASETS.map((sample) => (
          <Button
            key={sample.filename}
            size="sm"
            className="justify-start h-11 w-full bg-slate-50 hover:bg-slate-100 text-left text-slate-900 border border-slate-200"
            onClick={() => void loadSample(sample.csv, sample.filename)}
            disabled={uploading}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4 shrink-0" />
            <div className="flex-1 text-left">
              <div className="font-medium">{sample.name}</div>
              <div className="text-xs text-slate-500">{sample.rows} rows</div>
            </div>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
