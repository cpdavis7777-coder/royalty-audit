"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Extraction } from "@/types/extraction";

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

interface AuditResult {
  eiaPrice: number | null;
  eiaSeries: string | null;
  priceUnit: string | null;
  eiaPeriod: string | null;
  royaltyVolume: number;
  expectedGrossValue: number;
  expectedNet: number;
  variance: number;
  variancePct: number;
  narrative: string;
}

type Phase =
  | "loading"
  | "rrc_lookup"
  | "awaiting_volume"
  | "running"
  | "done"
  | "error";

function StatCard({
  label,
  value,
  note,
  highlight,
}: {
  label: string;
  value: string;
  note: string;
  highlight?: "green" | "red" | "yellow" | "default";
}) {
  const colors: Record<string, string> = {
    green: "text-green-400",
    red: "text-red-400",
    yellow: "text-yellow-400",
    default: "text-primary",
  };
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold font-mono ${colors[highlight ?? "default"]}`}>
          {value}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{note}</p>
      </CardContent>
    </Card>
  );
}

function NarrativeSection({ markdown }: { markdown: string }) {
  // Parse the markdown into sections split by ## headers
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

export default function AuditPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [phase, setPhase] = useState<Phase>("loading");
  const [stored, setStored] = useState<StoredAudit | null>(null);
  const [rrcResult, setRRCResult] = useState<RRCResult | null>(null);
  const [manualVolume, setManualVolume] = useState<string>("");
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Load extraction from localStorage and kick off RRC lookup
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

    const { extraction } = parsed;
    fetch("/api/rrc-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operator_name: extraction.operator_name,
        well_name: extraction.well_name,
        api_number: extraction.api_number,
        production_month: extraction.production_month,
      }),
    })
      .then((r) => r.json())
      .then((result: RRCResult) => {
        setRRCResult(result);
        if (result.status === "found" && result.volume) {
          setManualVolume(String(result.volume));
        }
        setPhase("awaiting_volume");
      })
      .catch(() => {
        setRRCResult({
          status: "manual",
          label: "Manually entered",
          message: "RRC lookup failed. Please enter production volume manually.",
        });
        setPhase("awaiting_volume");
      });
  }, [id]);

  async function runAudit() {
    if (!stored) return;
    const volume = parseFloat(manualVolume);
    if (isNaN(volume) || volume <= 0) return;

    setPhase("running");

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraction: stored.extraction,
          grossProductionVolume: volume,
          volumeSource: rrcResult?.status === "found" ? rrcResult.source ?? "Texas RRC" : "Manually entered",
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail ?? json.error ?? "Audit API failed");
      }

      setAuditResult(json as AuditResult);
      setPhase("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Audit failed. Please try again.");
      setPhase("error");
    }
  }

  const extraction = stored?.extraction;

  // Determine variance highlight color
  function varianceColor(pct: number): "green" | "red" | "yellow" {
    if (Math.abs(pct) <= 5) return "green";
    if (pct < -5) return "red";
    return "yellow";
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <div className="mb-8">
        <Link
          href="/upload"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
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
            {" · "}
            {stored.extraction.production_month}
          </p>
        )}
      </div>

      {/* Loading / RRC lookup */}
      {(phase === "loading" || phase === "rrc_lookup") && (
        <Card className="bg-card border-border mb-6">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground animate-pulse">
              {phase === "loading" ? "Loading audit data…" : "Looking up production in Texas RRC…"}
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
            <Link
              href="/upload"
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              Start over →
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Volume entry + audit trigger */}
      {phase === "awaiting_volume" && extraction && rrcResult && (
        <div className="space-y-6">
          {/* Extracted fields summary */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Check stub summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                {[
                  ["Operator", extraction.operator_name],
                  ["Well", extraction.well_name],
                  ["Product", `${extraction.product_type.toUpperCase()} (${extraction.unit})`],
                  ["Decimal Interest", `${(extraction.decimal_interest * 100).toFixed(4)}%`],
                  ["Net Volume (stub)", `${extraction.net_volume} ${extraction.unit}`],
                  ["Net Check Amount", `$${extraction.net_check_amount.toFixed(2)}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b border-border/40 py-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono">{value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* RRC result / manual entry */}
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">Production volume</CardTitle>
                <Badge
                  className={
                    rrcResult.status === "found"
                      ? "bg-green-500/20 text-green-400 border-green-500/30"
                      : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                  }
                >
                  {rrcResult.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {rrcResult.status === "manual" && rrcResult.message && (
                <p className="text-sm text-muted-foreground mb-4">{rrcResult.message}</p>
              )}
              {rrcResult.status === "found" && (
                <p className="text-sm text-muted-foreground mb-4">
                  Found{" "}
                  <span className="text-foreground font-mono font-semibold">
                    {rrcResult.volume?.toLocaleString()} {rrcResult.unit}
                  </span>{" "}
                  gross production for this well from the Texas RRC. You can adjust below if needed.
                </p>
              )}
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground block mb-1">
                    Gross production volume ({extraction.unit})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={manualVolume}
                    onChange={(e) => setManualVolume(e.target.value)}
                    placeholder={`Enter gross ${extraction.unit === "bbl" ? "barrels" : "Mcf"} for ${extraction.production_month}`}
                    className="bg-background border border-input rounded px-3 py-2 text-sm font-mono w-full focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <button
                  onClick={runAudit}
                  disabled={!manualVolume || parseFloat(manualVolume) <= 0}
                  className="bg-primary text-primary-foreground font-medium px-6 py-2 rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Run audit →
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Enter the <em>gross</em> production volume for the lease (before your royalty fraction is
                applied). Find this on your division order or the operator&apos;s run ticket.
              </p>
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
              Fetching EIA benchmark price · Calculating variance · Generating report
            </p>
          </CardContent>
        </Card>
      )}

      {/* Done — full report */}
      {phase === "done" && auditResult && extraction && (
        <div className="space-y-8">
          {/* Stat cards */}
          <div className="grid md:grid-cols-3 gap-4">
            <StatCard
              label="Expected royalty"
              value={`$${auditResult.expectedNet.toFixed(2)}`}
              note={
                auditResult.eiaPrice
                  ? `Based on EIA ${auditResult.eiaPeriod} price ($${auditResult.eiaPrice.toFixed(2)} ${auditResult.priceUnit})`
                  : "Based on stub gross value"
              }
              highlight="default"
            />
            <StatCard
              label="Actual received"
              value={`$${extraction.net_check_amount.toFixed(2)}`}
              note="From your check stub"
              highlight="default"
            />
            <StatCard
              label="Variance"
              value={`${auditResult.variance >= 0 ? "+" : ""}$${auditResult.variance.toFixed(2)}`}
              note={`${auditResult.variancePct >= 0 ? "+" : ""}${auditResult.variancePct.toFixed(1)}% · ${Math.abs(auditResult.variancePct) <= 5 ? "Within normal range" : auditResult.variance < 0 ? "Possible underpayment" : "Possible overpayment"}`}
              highlight={varianceColor(auditResult.variancePct)}
            />
          </div>

          {/* Data sources */}
          <Card className="bg-muted/20 border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
                <span>
                  <span className="text-foreground font-medium">Volume source: </span>
                  {rrcResult?.status === "found" ? rrcResult.source : "Manually entered"} ·{" "}
                  {parseFloat(manualVolume).toLocaleString()} {extraction.unit} gross
                </span>
                {auditResult.eiaPrice && (
                  <span>
                    <span className="text-foreground font-medium">Price: </span>
                    EIA {auditResult.eiaSeries} ({auditResult.eiaPeriod}) ·{" "}
                    ${auditResult.eiaPrice.toFixed(2)} {auditResult.priceUnit}
                  </span>
                )}
                <span>
                  <span className="text-foreground font-medium">Royalty volume: </span>
                  {auditResult.royaltyVolume.toFixed(4)} {extraction.unit}
                </span>
              </div>
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
