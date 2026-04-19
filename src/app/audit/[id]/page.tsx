"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Extraction } from "@/types/extraction";
import { type AuditResponse, type LineItemResult } from "@/app/api/audit/route";

interface StoredAudit {
  extraction: Extraction;
  fileName: string;
}

interface RRCResult {
  status: "found" | "manual";
  volume?: number;
  unit?: string;
  source?: string;
  label: string;
  message?: string;
}

type Phase = "loading" | "rrc_lookup" | "awaiting_input" | "running" | "done" | "error";

function StatCard({
  label,
  value,
  note,
  highlight = "default",
}: {
  label: string;
  value: string;
  note: string;
  highlight?: "green" | "red" | "yellow" | "default";
}) {
  const color =
    highlight === "green"
      ? "text-green-400"
      : highlight === "red"
      ? "text-red-400"
      : highlight === "yellow"
      ? "text-yellow-400"
      : "text-primary";

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{note}</p>
      </CardContent>
    </Card>
  );
}

function NarrativeSection({ markdown }: { markdown: string }) {
  const sections = markdown.split(/\n(?=## )/).filter(Boolean);
  return (
    <div className="space-y-6">
      {sections.map((section, i) => {
        const lines = section.trim().split("\n");
        const header = lines[0].replace(/^##\s*/, "");
        const body = lines.slice(1).join("\n").trim();
        return (
          <Card key={i} className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">{header}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {body}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function DifferentialBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  const normal = pct >= 10 && pct <= 55;
  return (
    <span
      className={`font-mono text-xs px-1.5 py-0.5 rounded ${
        normal
          ? "bg-green-500/15 text-green-400"
          : "bg-yellow-500/15 text-yellow-400"
      }`}
    >
      {pct.toFixed(1)}% below EIA{normal ? " ✓" : " — review"}
    </span>
  );
}

function LineItemsTable({ results }: { results: LineItemResult[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-xs">
        <thead>
          <tr className="border-b border-border">
            {["Month", "Product", "Volume", "Price Paid", "EIA Benchmark", "Differential", "Net"].map(
              (h) => (
                <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-muted/20" : ""}>
              <td className="px-3 py-2 font-mono">{r.item.production_month}</td>
              <td className="px-3 py-2 font-mono uppercase">{r.item.product_type}</td>
              <td className="px-3 py-2 font-mono">
                {r.item.owner_volume} {r.item.unit}
              </td>
              <td className="px-3 py-2 font-mono">
                {r.item.price_per_unit > 0
                  ? `$${r.item.price_per_unit.toFixed(2)}`
                  : <span className="text-muted-foreground">not shown</span>}
              </td>
              <td className="px-3 py-2 font-mono">
                {r.eiaPrice ? (
                  `$${r.eiaPrice.toFixed(2)} ${r.eiaUnit ?? ""}`
                ) : (
                  <span className="text-muted-foreground">N/A</span>
                )}
              </td>
              <td className="px-3 py-2">
                <DifferentialBadge pct={r.wellheadDifferentialPct} />
              </td>
              <td className="px-3 py-2 font-mono">${r.item.owner_net.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AuditPage() {
  const { id } = useParams<{ id: string }>();

  const [phase, setPhase] = useState<Phase>("loading");
  const [stored, setStored] = useState<StoredAudit | null>(null);
  const [rrcResult, setRRCResult] = useState<RRCResult | null>(null);
  const [manualVolume, setManualVolume] = useState<string>("");
  const [auditResult, setAuditResult] = useState<AuditResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const raw = localStorage.getItem(`audit_${id}`);
    if (!raw) {
      setErrorMsg("Audit session not found. Please upload a check stub first.");
      setPhase("error");
      return;
    }

    let parsed: StoredAudit;
    try {
      parsed = JSON.parse(raw) as StoredAudit;
    } catch {
      setErrorMsg("Audit data is corrupted. Please start over.");
      setPhase("error");
      return;
    }

    setStored(parsed);
    setPhase("rrc_lookup");

    // Use first line item's month and fields for RRC lookup
    const { extraction } = parsed;
    const firstItem = extraction.line_items[0];
    fetch("/api/rrc-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operator_name: extraction.operator_name,
        well_name: extraction.well_name,
        api_number: extraction.api_number,
        production_month: firstItem?.production_month ?? "",
      }),
    })
      .then((r) => r.json())
      .then((result: RRCResult) => {
        setRRCResult(result);
        if (result.status === "found" && result.volume) {
          setManualVolume(String(result.volume));
        }
        setPhase("awaiting_input");
      })
      .catch(() => {
        setRRCResult({ status: "manual", label: "Manually entered", message: "RRC lookup failed." });
        setPhase("awaiting_input");
      });
  }, [id]);

  async function runAudit() {
    if (!stored) return;
    setPhase("running");

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraction: stored.extraction,
          grossProductionVolume: parseFloat(manualVolume) || 0,
          volumeSource:
            rrcResult?.status === "found" ? rrcResult.source ?? "Texas RRC" : "Manually entered",
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.detail ?? json.error ?? "Audit API failed");
      setAuditResult(json as AuditResponse);
      setPhase("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Audit failed. Please try again.");
      setPhase("error");
    }
  }

  const extraction = stored?.extraction;

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="mb-8">
        <Link href="/upload" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← New audit
        </Link>
      </div>

      <div className="mb-10">
        <Badge className="mb-3 bg-primary/20 text-primary border-primary/30">
          {phase === "done" ? "Step 3 of 3 — Complete" : "Step 2 of 3"}
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Audit Report</h1>
        {stored && (
          <p className="text-muted-foreground text-sm">
            {stored.extraction.well_name || stored.extraction.operator_name || stored.fileName}
            {stored.extraction.line_items.length > 0 && (
              <> · {stored.extraction.line_items.length} line item{stored.extraction.line_items.length !== 1 ? "s" : ""}</>
            )}
          </p>
        )}
      </div>

      {/* Loading */}
      {(phase === "loading" || phase === "rrc_lookup") && (
        <Card className="bg-card border-border mb-6">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground animate-pulse">
              {phase === "loading" ? "Loading audit data…" : "Checking Texas RRC production records…"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {phase === "error" && (
        <Card className="bg-destructive/10 border-destructive/30 mb-6">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive font-medium">Something went wrong</p>
            <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
            <Link href="/upload" className="mt-3 inline-block text-sm text-primary hover:underline">
              Start over →
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Awaiting input */}
      {phase === "awaiting_input" && extraction && rrcResult && (
        <div className="space-y-6">
          {/* Stub line items summary */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Check stub line items</CardTitle>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>{extraction.operator_name}</span>
                  <span>·</span>
                  <span className="font-mono">${extraction.net_check_amount.toFixed(2)} total</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {["Month", "Product", "Volume", "Price/Unit", "Gross", "Deductions", "Taxes", "Net"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extraction.line_items.map((item, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                        <td className="px-3 py-2 font-mono">{item.production_month}</td>
                        <td className="px-3 py-2 font-mono uppercase">{item.product_type}</td>
                        <td className="px-3 py-2 font-mono">{item.owner_volume} {item.unit}</td>
                        <td className="px-3 py-2 font-mono">
                          {item.price_per_unit > 0 ? `$${item.price_per_unit.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono">${item.owner_gross.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono">${item.owner_deductions.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono">${item.taxes.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono">${item.owner_net.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* RRC + run audit */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">Verify production volume (optional)</CardTitle>
                <Badge
                  className={
                    rrcResult.status === "found"
                      ? "bg-green-500/20 text-green-400 border-green-500/30"
                      : "bg-muted/40 text-muted-foreground border-border"
                  }
                >
                  {rrcResult.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {rrcResult.message && (
                <p className="text-xs text-muted-foreground mb-3">{rrcResult.message}</p>
              )}
              {rrcResult.status === "found" && rrcResult.volume && (
                <p className="text-xs text-muted-foreground mb-3">
                  RRC records show{" "}
                  <span className="text-foreground font-mono font-semibold">
                    {rrcResult.volume.toLocaleString()} {rrcResult.unit}
                  </span>{" "}
                  gross production. Adjust below if needed.
                </p>
              )}
              <div className="flex gap-3 items-end">
                <div className="flex-1 max-w-xs">
                  <label className="text-xs text-muted-foreground block mb-1">
                    Gross production volume for primary month (optional)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={manualVolume}
                    onChange={(e) => setManualVolume(e.target.value)}
                    placeholder="Leave blank to use stub volumes"
                    className="bg-background border border-input rounded px-3 py-2 text-sm font-mono w-full focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <button
                  onClick={runAudit}
                  className="bg-primary text-primary-foreground font-medium px-6 py-2 rounded-md text-sm hover:bg-primary/90 transition-colors"
                >
                  Run audit →
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Running */}
      {phase === "running" && (
        <Card className="bg-card border-border mb-6">
          <CardContent className="pt-6 text-center space-y-2">
            <p className="text-sm font-medium animate-pulse">Running audit…</p>
            <p className="text-xs text-muted-foreground">
              Fetching EIA benchmark prices · Checking stub math · Generating report
            </p>
          </CardContent>
        </Card>
      )}

      {/* Done */}
      {phase === "done" && auditResult && extraction && (
        <div className="space-y-8">
          {/* Stat cards */}
          <div className="grid md:grid-cols-3 gap-4">
            <StatCard
              label="Stub total"
              value={`$${auditResult.sumOwnerNet.toFixed(2)}`}
              note="Sum of all line item net amounts"
            />
            <StatCard
              label="Check amount"
              value={`$${extraction.net_check_amount.toFixed(2)}`}
              note="Printed on check stub"
            />
            <StatCard
              label="Math check"
              value={auditResult.mathOk ? "Passes ✓" : `Off by $${Math.abs(auditResult.mathVariance).toFixed(2)}`}
              note={
                auditResult.mathOk
                  ? "Stub totals reconcile"
                  : "Possible missing line item or extraction imprecision"
              }
              highlight={auditResult.mathOk ? "green" : "yellow"}
            />
          </div>

          {/* Price comparison table */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Price analysis by line item</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Wellhead prices are always below exchange benchmarks. A 20–45% discount to WTI or Henry Hub is normal.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <LineItemsTable results={auditResult.lineItemResults} />
            </CardContent>
          </Card>

          {/* Narrative */}
          <NarrativeSection markdown={auditResult.narrative} />

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2">
            <Link
              href="/upload"
              className="border border-border text-sm font-medium px-5 py-2 rounded-md hover:bg-secondary transition-colors"
            >
              Audit another stub
            </Link>
            <button
              disabled
              className="bg-primary/50 text-primary-foreground font-medium px-6 py-2 rounded-md text-sm cursor-not-allowed opacity-60"
            >
              Download PDF (coming soon)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
