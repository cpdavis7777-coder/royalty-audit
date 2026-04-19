"use client";

import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Extraction } from "@/types/extraction";

type Status = "idle" | "uploading" | "success" | "error";

function friendlyError(serverMsg: string): string {
  const m = serverMsg.toLowerCase();
  if (!serverMsg || m.includes("internal server error")) {
    return "We couldn't process this file. It may be low-resolution, password-protected, or in an unsupported format. Try a clear JPG or PNG scan.";
  }
  if (m.includes("429") || m.includes("too many requests") || m.includes("quota") || m.includes("rate limit")) {
    return "Our extraction service is temporarily at capacity. Please try again in a minute.";
  }
  if (m.includes("credit balance") || m.includes("billing") || m.includes("upgrade")) {
    return "Our extraction service is temporarily unavailable. Please try again shortly.";
  }
  if (m.includes("unsupported file type")) {
    return serverMsg;
  }
  if (m.includes("non-json") || m.includes("schema")) {
    return "We couldn't extract recognizable fields from this file. Make sure it's a royalty check stub — blurry or low-resolution files may not work.";
  }
  return "We couldn't process this file. Please try a clearer image or a different format.";
}

const FIELD_LABELS: Record<keyof Extraction, string> = {
  operator_name: "Operator",
  well_name: "Well Name",
  api_number: "API Number",
  production_month: "Production Month",
  decimal_interest: "Decimal Interest",
  net_volume: "Net Volume",
  unit: "Unit",
  product_type: "Product",
  gross_value: "Gross Value",
  total_deductions: "Total Deductions",
  net_check_amount: "Net Check Amount",
};

const CURRENCY_FIELDS = new Set(["gross_value", "total_deductions", "net_check_amount"]);

function formatValue(key: keyof Extraction, value: Extraction[keyof Extraction]): string {
  if (value === null || value === undefined) return "—";
  if (CURRENCY_FIELDS.has(key)) return `$${(value as number).toFixed(2)}`;
  if (key === "decimal_interest") return `${(value as number).toFixed(6)} (${((value as number) * 100).toFixed(4)}%)`;
  if (key === "net_volume") return String(value);
  return String(value);
}

export default function UploadPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  async function handleFile(file: File) {
    setFileName(file.name);
    setStatus("uploading");
    setExtraction(null);
    setErrorMsg("");

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const json = await res.json();

      if (!res.ok) {
        const isDev = process.env.NODE_ENV === "development";
        const detail = json.detail as string | undefined;
        setErrorMsg(isDev && detail ? detail : friendlyError(json.error ?? ""));
        setStatus("error");
        return;
      }

      setExtraction(json.data);
      setStatus("success");
    } catch {
      setErrorMsg("Network error — please try again.");
      setStatus("error");
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <div className="text-center mb-12">
        <Badge className="mb-4 bg-primary/20 text-primary border-primary/30">Step 1 of 3</Badge>
        <h1 className="text-4xl font-bold tracking-tight mb-3">Upload your check stub</h1>
        <p className="text-muted-foreground">
          PDF or image (JPG, PNG, HEIC). We extract the key fields automatically — your file
          is never stored.
        </p>
      </div>

      {/* Drop zone */}
      <label
        htmlFor="file-upload"
        className={`block border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors mb-8 ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input
          id="file-upload"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.heic,.webp"
          className="sr-only"
          onChange={onInputChange}
          disabled={status === "uploading"}
        />
        <div className="space-y-2">
          <div className="text-4xl">📄</div>
          <p className="text-foreground font-medium">
            {status === "uploading" ? "Extracting fields…" : "Drop your check stub here"}
          </p>
          <p className="text-sm text-muted-foreground">or click to browse · PDF, JPG, PNG, HEIC</p>
        </div>
      </label>

      {/* Uploading state */}
      {status === "uploading" && (
        <Card className="bg-card border-border mb-6">
          <CardContent className="pt-6 text-center">
            <div className="text-sm text-muted-foreground animate-pulse">
              Analyzing · Extracting fields from <span className="text-foreground font-mono">{fileName}</span>…
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {status === "error" && (
        <Card className="bg-destructive/10 border-destructive/30 mb-6">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive font-medium">Extraction failed</p>
            <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
          </CardContent>
        </Card>
      )}

      {/* Results table */}
      {status === "success" && extraction && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Extracted fields</CardTitle>
              <p className="text-xs text-muted-foreground mt-1 font-mono">{fileName}</p>
            </div>
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Verified</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <tbody>
                {(Object.entries(FIELD_LABELS) as [keyof Extraction, string][]).map(([key, label], i) => (
                  <tr key={key} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                    <td className="px-6 py-3 text-sm text-muted-foreground font-medium w-52">{label}</td>
                    <td className="px-6 py-3 text-sm font-mono">{formatValue(key, extraction[key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
          <div className="p-6 border-t border-border flex gap-3 flex-wrap">
            <button
              disabled
              className="bg-primary/50 text-primary-foreground font-medium px-5 py-2 rounded-md text-sm cursor-not-allowed opacity-60"
            >
              Run full audit (coming next session)
            </button>
            <label
              htmlFor="file-upload-reset"
              className="border border-border text-sm font-medium px-5 py-2 rounded-md hover:bg-secondary transition-colors cursor-pointer"
            >
              Upload another
              <input
                id="file-upload-reset"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.heic,.webp"
                className="sr-only"
                onChange={onInputChange}
              />
            </label>
          </div>
        </Card>
      )}
    </div>
  );
}
