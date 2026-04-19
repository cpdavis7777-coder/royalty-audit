"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Extraction, type LineItem } from "@/types/extraction";

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
  if (m.includes("unsupported file type")) return serverMsg;
  if (m.includes("non-json") || m.includes("schema")) {
    return "We couldn't extract recognizable fields from this file. Make sure it's a royalty check stub — blurry or low-resolution files may not work.";
  }
  return "We couldn't process this file. Please try a clearer image or a different format.";
}

// ── Top-level header fields ─────────────────────────────────────────────────

type HeaderKey = "operator_name" | "well_name" | "api_number" | "decimal_interest" | "net_check_amount";

const HEADER_FIELDS: Array<{ key: HeaderKey; label: string }> = [
  { key: "operator_name", label: "Operator" },
  { key: "well_name", label: "Well Name" },
  { key: "api_number", label: "API Number" },
  { key: "decimal_interest", label: "Decimal Interest" },
  { key: "net_check_amount", label: "Net Check Amount" },
];

function formatHeaderValue(key: HeaderKey, value: Extraction[HeaderKey]): string {
  if (value === null || value === undefined) return "—";
  if (key === "net_check_amount") return `$${(value as number).toFixed(2)}`;
  if (key === "decimal_interest") {
    const n = value as number;
    return `${n.toFixed(6)} (${(n * 100).toFixed(4)}%)`;
  }
  return String(value);
}

// ── Line items table ────────────────────────────────────────────────────────

interface ItemCol {
  key: keyof LineItem;
  label: string;
  minW: string;
  currency?: boolean;
  numeric?: boolean;
  options?: string[];
}

const ITEM_COLS: ItemCol[] = [
  { key: "production_month", label: "Month", minW: "min-w-[130px]" },
  { key: "product_type", label: "Product", minW: "min-w-[80px]", options: ["oil", "gas", "ngl"] },
  { key: "unit", label: "Unit", minW: "min-w-[60px]", options: ["bbl", "mcf", "gal"] },
  { key: "owner_volume", label: "Volume", minW: "min-w-[90px]", numeric: true },
  { key: "price_per_unit", label: "$/Unit", minW: "min-w-[80px]", currency: true, numeric: true },
  { key: "owner_gross", label: "Gross", minW: "min-w-[90px]", currency: true, numeric: true },
  { key: "owner_deductions", label: "Deductions", minW: "min-w-[100px]", currency: true, numeric: true },
  { key: "taxes", label: "Taxes", minW: "min-w-[80px]", currency: true, numeric: true },
  { key: "owner_net", label: "Net", minW: "min-w-[90px]", currency: true, numeric: true },
];

function formatItemValue(col: ItemCol, value: LineItem[keyof LineItem]): string {
  if (value === null || value === undefined) return "—";
  if (col.currency) return `$${(value as number).toFixed(2)}`;
  return String(value);
}

function ItemEditCell({
  col,
  value,
  onChange,
}: {
  col: ItemCol;
  value: LineItem[keyof LineItem];
  onChange: (v: string) => void;
}) {
  const base =
    "bg-background border border-input rounded px-1 py-0.5 text-xs font-mono w-full focus:outline-none focus:ring-1 focus:ring-primary";

  if (col.options) {
    return (
      <select value={String(value)} onChange={(e) => onChange(e.target.value)} className={base}>
        {col.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (col.numeric) {
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

// ── Main page ────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedExtraction, setEditedExtraction] = useState<Extraction | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  async function handleFile(file: File) {
    setFileName(file.name);
    setStatus("uploading");
    setExtraction(null);
    setEditMode(false);
    setEditedExtraction(null);
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
    setEditedExtraction(JSON.parse(JSON.stringify(extraction)) as Extraction);
    setEditMode(true);
  }

  function saveEdit() {
    if (editedExtraction) setExtraction(editedExtraction);
    setEditMode(false);
    setEditedExtraction(null);
  }

  function cancelEdit() {
    setEditMode(false);
    setEditedExtraction(null);
  }

  function updateHeader(key: HeaderKey, raw: string) {
    if (!editedExtraction) return;
    const numericKeys: HeaderKey[] = ["decimal_interest", "net_check_amount"];
    const val = numericKeys.includes(key) ? (parseFloat(raw) || 0) : raw;
    setEditedExtraction({ ...editedExtraction, [key]: val });
  }

  function updateLineItem(index: number, key: keyof LineItem, raw: string) {
    if (!editedExtraction) return;
    const numericKeys: (keyof LineItem)[] = [
      "owner_volume", "price_per_unit", "owner_gross", "owner_deductions", "taxes", "owner_net",
    ];
    const val = numericKeys.includes(key) ? (parseFloat(raw) || 0) : raw;
    const newItems = editedExtraction.line_items.map((item, i) =>
      i === index ? { ...item, [key]: val } : item
    );
    setEditedExtraction({ ...editedExtraction, line_items: newItems });
  }

  function runAudit() {
    if (!extraction) return;
    const id = crypto.randomUUID();
    localStorage.setItem(`audit_${id}`, JSON.stringify({ extraction, fileName }));
    router.push(`/audit/${id}`);
  }

  const displayed = editMode ? editedExtraction : extraction;

  // Totals for the footer row
  const totals = displayed
    ? {
        owner_gross: displayed.line_items.reduce((s, i) => s + i.owner_gross, 0),
        owner_deductions: displayed.line_items.reduce((s, i) => s + i.owner_deductions, 0),
        taxes: displayed.line_items.reduce((s, i) => s + i.taxes, 0),
        owner_net: displayed.line_items.reduce((s, i) => s + i.owner_net, 0),
      }
    : null;

  const mathOk =
    totals && displayed
      ? Math.abs(totals.owner_net - displayed.net_check_amount) < 1.0
      : true;

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      {/* Header */}
      <div className="text-center mb-12">
        <Badge className="mb-4 bg-primary/20 text-primary border-primary/30">Step 1 of 3</Badge>
        <h1 className="text-4xl font-bold tracking-tight mb-3">Upload your check stub</h1>
        <p className="text-muted-foreground">
          PDF or image (JPG, PNG, HEIC). We extract every line item automatically — your file is
          never stored.
        </p>
      </div>

      {/* Drop zone */}
      <label
        htmlFor="file-upload"
        className={`block border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors mb-8 max-w-3xl mx-auto ${
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
        <Card className="bg-card border-border mb-6 max-w-3xl mx-auto">
          <CardContent className="pt-6 text-center">
            <div className="text-sm text-muted-foreground animate-pulse">
              Analyzing · Extracting all line items from{" "}
              <span className="text-foreground font-mono">{fileName}</span>…
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {status === "error" && (
        <Card className="bg-destructive/10 border-destructive/30 mb-6 max-w-3xl mx-auto">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive font-medium">Extraction failed</p>
            <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {status === "success" && displayed && (
        <div className="space-y-4">
          {/* Header fields card */}
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">
                  {editMode ? "Edit stub fields" : "Extracted fields"}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1 font-mono">{fileName}</p>
              </div>
              {editMode ? (
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                  Editing
                </Badge>
              ) : (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  Verified
                </Badge>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <tbody>
                  {HEADER_FIELDS.map(({ key, label }, i) => (
                    <tr key={key} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                      <td className="px-6 py-2.5 text-sm text-muted-foreground font-medium w-48">
                        {label}
                      </td>
                      <td className="px-6 py-2.5 text-sm font-mono">
                        {editMode && editedExtraction ? (
                          <input
                            type={key === "decimal_interest" || key === "net_check_amount" ? "number" : "text"}
                            step="any"
                            value={String(editedExtraction[key])}
                            onChange={(e) => updateHeader(key, e.target.value)}
                            className="bg-background border border-input rounded px-2 py-1 text-sm font-mono w-full max-w-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          formatHeaderValue(key, displayed[key] as Extraction[HeaderKey])
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Line items card */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Production line items
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({displayed.line_items.length} row{displayed.line_items.length !== 1 ? "s" : ""})
                  </span>
                </CardTitle>
                {!mathOk && (
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                    Sum ≠ check amount — verify
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {ITEM_COLS.map((col) => (
                        <th
                          key={col.key}
                          className={`px-3 py-2 text-left font-medium text-muted-foreground ${col.minW}`}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.line_items.map((item, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className={rowIdx % 2 === 0 ? "bg-muted/20" : ""}
                      >
                        {ITEM_COLS.map((col) => (
                          <td key={col.key} className="px-3 py-2 font-mono">
                            {editMode && editedExtraction ? (
                              <ItemEditCell
                                col={col}
                                value={item[col.key]}
                                onChange={(v) => updateLineItem(rowIdx, col.key, v)}
                              />
                            ) : (
                              formatItemValue(col, item[col.key])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals row */}
                  {totals && (
                    <tfoot>
                      <tr className="border-t border-border font-semibold">
                        <td colSpan={5} className="px-3 py-2 text-xs text-muted-foreground">
                          Totals
                        </td>
                        <td className="px-3 py-2 font-mono">${totals.owner_gross.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono">${totals.owner_deductions.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono">${totals.taxes.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono">
                          <span className={mathOk ? "text-green-400" : "text-yellow-400"}>
                            ${totals.owner_net.toFixed(2)}
                          </span>
                          {!mathOk && (
                            <span className="ml-1 text-muted-foreground">
                              (stub: ${displayed.net_check_amount.toFixed(2)})
                            </span>
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>

            {/* Actions */}
            <div className="p-4 border-t border-border flex gap-3 flex-wrap">
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
        </div>
      )}
    </div>
  );
}
