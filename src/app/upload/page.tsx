"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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

const CURRENCY_FIELDS = new Set<keyof Extraction>(["gross_value", "total_deductions", "net_check_amount"]);
const NUMERIC_FIELDS = new Set<keyof Extraction>(["decimal_interest", "net_volume", "gross_value", "total_deductions", "net_check_amount"]);
const ENUM_OPTIONS: Partial<Record<keyof Extraction, string[]>> = {
  unit: ["bbl", "mcf"],
  product_type: ["oil", "gas"],
};

function formatValue(key: keyof Extraction, value: Extraction[keyof Extraction]): string {
  if (value === null || value === undefined) return "—";
  if (CURRENCY_FIELDS.has(key)) return `$${(value as number).toFixed(2)}`;
  if (key === "decimal_interest") return `${(value as number).toFixed(6)} (${((value as number) * 100).toFixed(4)}%)`;
  return String(value);
}

function EditCell({
  field,
  value,
  onChange,
}: {
  field: keyof Extraction;
  value: Extraction[keyof Extraction];
  onChange: (v: string) => void;
}) {
  const opts = ENUM_OPTIONS[field];
  const base = "bg-background border border-input rounded px-2 py-1 text-sm font-mono w-full focus:outline-none focus:ring-1 focus:ring-primary";

  if (opts) {
    return (
      <select value={String(value)} onChange={(e) => onChange(e.target.value)} className={base}>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (NUMERIC_FIELDS.has(field)) {
    return (
      <input
        type="number"
        step="any"
        value={value as number}
        onChange={(e) => onChange(e.target.value)}
        className={base}
      />
    );
  }

  return (
    <input
      type="text"
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      className={base}
    />
  );
}

export default function UploadPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedFields, setEditedFields] = useState<Extraction | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  async function handleFile(file: File) {
    setFileName(file.name);
    setStatus("uploading");
    setExtraction(null);
    setEditMode(false);
    setEditedFields(null);
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

  function startEdit() {
    if (!extraction) return;
    setEditedFields({ ...extraction });
    setEditMode(true);
  }

  function saveEdit() {
    if (editedFields) setExtraction(editedFields);
    setEditMode(false);
    setEditedFields(null);
  }

  function cancelEdit() {
    setEditMode(false);
    setEditedFields(null);
  }

  function updateField(key: keyof Extraction, raw: string) {
    if (!editedFields) return;
    const parsed = NUMERIC_FIELDS.has(key) ? (parseFloat(raw) || 0) : raw;
    setEditedFields({ ...editedFields, [key]: parsed });
  }

  function runAudit() {
    if (!extraction) return;
    const id = crypto.randomUUID();
    localStorage.setItem(`audit_${id}`, JSON.stringify({ extraction, fileName }));
    router.push(`/audit/${id}`);
  }

  const displayed = editMode ? editedFields : extraction;

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <div className="text-center mb-12">
        <Badge className="mb-4 bg-primary/20 text-primary border-primary/30">Step 1 of 3</Badge>
        <h1 className="text-4xl font-bold tracking-tight mb-3">Upload your check stub</h1>
        <p className="text-muted-foreground">
          PDF or image (JPG, PNG, HEIC). We extract the key fields automatically — your file is never
          stored.
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
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
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

      {/* Uploading */}
      {status === "uploading" && (
        <Card className="bg-card border-border mb-6">
          <CardContent className="pt-6 text-center">
            <div className="text-sm text-muted-foreground animate-pulse">
              Analyzing · Extracting fields from{" "}
              <span className="text-foreground font-mono">{fileName}</span>…
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {status === "error" && (
        <Card className="bg-destructive/10 border-destructive/30 mb-6">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive font-medium">Extraction failed</p>
            <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {status === "success" && displayed && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">
                {editMode ? "Edit extracted fields" : "Extracted fields"}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1 font-mono">{fileName}</p>
            </div>
            {editMode ? (
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                Editing
              </Badge>
            ) : (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Verified</Badge>
            )}
          </CardHeader>

          <CardContent className="p-0">
            <table className="w-full">
              <tbody>
                {(Object.entries(FIELD_LABELS) as [keyof Extraction, string][]).map(
                  ([key, label], i) => (
                    <tr key={key} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                      <td className="px-6 py-3 text-sm text-muted-foreground font-medium w-52">
                        {label}
                      </td>
                      <td className="px-6 py-3 text-sm font-mono">
                        {editMode && editedFields ? (
                          <EditCell
                            field={key}
                            value={editedFields[key]}
                            onChange={(v) => updateField(key, v)}
                          />
                        ) : (
                          formatValue(key, displayed[key])
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </CardContent>

          <div className="p-6 border-t border-border flex gap-3 flex-wrap">
            {editMode ? (
              <>
                <button
                  onClick={saveEdit}
                  className="bg-primary text-primary-foreground font-medium px-5 py-2 rounded-md text-sm hover:bg-primary/90 transition-colors"
                >
                  Save changes
                </button>
                <button
                  onClick={cancelEdit}
                  className="border border-border text-sm font-medium px-5 py-2 rounded-md hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={runAudit}
                  className="bg-primary text-primary-foreground font-medium px-5 py-2 rounded-md text-sm hover:bg-primary/90 transition-colors"
                >
                  Run full audit →
                </button>
                <button
                  onClick={startEdit}
                  className="border border-border text-sm font-medium px-5 py-2 rounded-md hover:bg-secondary transition-colors"
                >
                  Edit fields
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
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
