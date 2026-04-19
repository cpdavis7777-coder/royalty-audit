import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { type Extraction, type LineItem } from "@/types/extraction";

const MONTH_MAP: Record<string, string> = {
  January: "01", February: "02", March: "03", April: "04",
  May: "05", June: "06", July: "07", August: "08",
  September: "09", October: "10", November: "11", December: "12",
};

interface EIAResult {
  price: number;
  series: string;
  unit: string;
  period: string;
}

// EIA series for each product type (NGL has no direct series — skip EIA for NGLs)
const EIA_SERIES: Record<string, { id: string; unit: string } | null> = {
  oil: { id: "PET.RWTC.M", unit: "$/bbl" },
  gas: { id: "NG.RNGWHHD.M", unit: "$/MMBtu" },
  ngl: null,
};

async function fetchEIAPrice(productType: string, yyyymm: string): Promise<EIAResult | null> {
  const apiKey = process.env.EIA_API_KEY;
  const series = EIA_SERIES[productType];
  if (!apiKey || !series) return null;

  for (const offset of [0, -1, -2]) {
    const [year, month] = yyyymm.split("-").map(Number);
    const d = new Date(year, month - 1 + offset, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    try {
      const url = `https://api.eia.gov/v2/seriesid/${series.id}?api_key=${apiKey}&start=${period}&end=${period}&offset=0&length=1`;
      const res = await fetch(url, { next: { revalidate: 3600 } });
      if (!res.ok) continue;

      const json = (await res.json()) as {
        response?: { data?: Array<{ period: string; value: string | number }> };
      };

      const row = json.response?.data?.[0];
      if (!row) continue;

      const price = parseFloat(String(row.value));
      if (!isNaN(price) && price > 0) {
        return { price, series: series.id, unit: series.unit, period };
      }
    } catch {
      continue;
    }
  }

  return null;
}

function parseYYYYMM(productionMonth: string): string {
  const parts = (productionMonth ?? "").split(" ");
  const monthNum = MONTH_MAP[parts[0]] ?? "01";
  return `${parts[1] ?? "0000"}-${monthNum}`;
}

export interface LineItemResult {
  item: LineItem;
  eiaPrice: number | null;
  eiaSeries: string | null;
  eiaUnit: string | null;
  eiaPeriod: string | null;
  // Wellhead differential = how much lower than EIA the operator paid, as %
  wellheadDifferentialPct: number | null;
  // Does stub internal math check out: owner_gross - owner_deductions - taxes ≈ owner_net
  lineItemMathOk: boolean;
  lineItemMathVariance: number;
}

export interface AuditResponse {
  lineItemResults: LineItemResult[];
  sumOwnerNet: number;
  mathVariance: number;       // sumOwnerNet - net_check_amount
  mathOk: boolean;
  narrative: string;
}

async function generateNarrative(
  extraction: Extraction,
  results: LineItemResult[],
  sumOwnerNet: number,
  mathVariance: number,
  mathOk: boolean
): Promise<string> {
  const client = new Anthropic();

  // Build a readable table of line items with EIA comparisons
  const lineRows = results
    .map((r) => {
      const stub = r.item;
      const stubPrice = stub.price_per_unit > 0 ? `$${stub.price_per_unit.toFixed(2)}/${stub.unit}` : "not shown on stub";
      let eiaContext = "EIA N/A";
      if (r.eiaPrice && stub.price_per_unit > 0) {
        const dollarDiff = (r.eiaPrice - stub.price_per_unit).toFixed(2);
        eiaContext = `EIA ${r.eiaPeriod}: $${r.eiaPrice.toFixed(2)} ${r.eiaUnit ?? ""} — operator paid $${dollarDiff}/${stub.unit} less (${r.wellheadDifferentialPct!.toFixed(1)}% wellhead discount)`;
      } else if (r.eiaPrice) {
        eiaContext = `EIA ${r.eiaPeriod}: $${r.eiaPrice.toFixed(2)} ${r.eiaUnit ?? ""} (stub price not shown, cannot compute differential)`;
      }
      const lineOk = r.lineItemMathOk ? "line math OK" : `line math off by $${Math.abs(r.lineItemMathVariance).toFixed(2)}`;
      return `  • ${stub.production_month} ${stub.product_type.toUpperCase()} | ${stub.owner_volume} ${stub.unit} | stub price: ${stubPrice} | ${eiaContext} | gross: $${stub.owner_gross.toFixed(2)} | deduc: $${stub.owner_deductions.toFixed(2)} | taxes: $${stub.taxes.toFixed(2)} | net: $${stub.owner_net.toFixed(2)} | ${lineOk}`;
    })
    .join("\n");

  const mathNote = mathOk
    ? `PASSES — sum of line items ($${sumOwnerNet.toFixed(2)}) matches check amount ($${extraction.net_check_amount.toFixed(2)}) within rounding.`
    : `FAILS — sum of line items ($${sumOwnerNet.toFixed(2)}) differs from check amount ($${extraction.net_check_amount.toFixed(2)}) by $${Math.abs(mathVariance).toFixed(2)}. Most likely cause: a line item was missed during extraction (not a payment error). User should count rows on the original stub.`;

  // Build explicit anomaly flags — only genuine outliers, not normal industry practices
  const anomalyFlags: string[] = [];
  for (const r of results) {
    if (r.wellheadDifferentialPct !== null) {
      if (r.wellheadDifferentialPct > 60) {
        anomalyFlags.push(
          `${r.item.production_month} ${r.item.product_type}: operator price is ${r.wellheadDifferentialPct.toFixed(1)}% below EIA benchmark — larger than typical (>60%). Worth asking the operator for a pricing statement.`
        );
      } else if (r.wellheadDifferentialPct < 0) {
        anomalyFlags.push(
          `${r.item.production_month} ${r.item.product_type}: stub price ($${r.item.price_per_unit.toFixed(2)}) is ABOVE the EIA benchmark ($${r.eiaPrice!.toFixed(2)}) — this is unusual and may indicate a data extraction error or an uncommonly favorable sale.`
        );
      }
    }
    if (!r.lineItemMathOk && Math.abs(r.lineItemMathVariance) > 1.0) {
      anomalyFlags.push(
        `${r.item.production_month} ${r.item.product_type}: line internal math (gross − deductions − taxes) is off by $${r.lineItemMathVariance.toFixed(2)}. Possible extraction imprecision — user should verify this row on the original stub.`
      );
    }
  }

  const anomalySection =
    anomalyFlags.length > 0
      ? `GENUINE ANOMALIES TO REPORT (only these — do not invent others):\n${anomalyFlags.map((f) => `  ! ${f}`).join("\n")}`
      : `NO ANOMALIES — All differentials are within the normal 10–55% wellhead range and line math checks out. Do NOT manufacture warnings or flag normal differentials.`;

  const prompt = `Generate a royalty audit report. Only reference numbers explicitly provided below — do not calculate or invent additional figures.

STUB OVERVIEW:
- Operator: ${extraction.operator_name || "(not extracted)"}
- Well: ${extraction.well_name || "(not extracted)"}
- API Number: ${extraction.api_number || "(not extracted)"}
- Decimal Interest: ${extraction.decimal_interest} (${(extraction.decimal_interest * 100).toFixed(4)}%)
- Total Net Check: $${extraction.net_check_amount.toFixed(2)}
- Line Items Extracted: ${extraction.line_items.length}

LINE ITEMS WITH EIA BENCHMARK CONTEXT:
${lineRows}

STUB MATH CHECK:
${mathNote}

${anomalySection}

RULES FOR THIS REPORT:
- A wellhead price discount of 10–55% below WTI or Henry Hub is completely normal. Do NOT flag it as suspicious.
- The math check result is definitive for whether the numbers add up. Trust it.
- If there are no anomaly flags above, the report should be reassuring, not cautionary.
- Do not reference specific dollar amounts that are not in the data above.
- "Next Steps" should be proportionate: normal checks → routine record-keeping. Anomaly flagged → ask operator for supporting document.
- Never recommend attorneys or formal demand letters in a first-pass audit.

Write the report with EXACTLY these four sections:

## Summary
2–3 sentences. Lead with the math check result. Then say whether the stub prices are within a normal wellhead range. Conclude with the overall picture. Be direct and neutral — do not hedge everything with "may" or "might" when the data is clear.

## Line Item Breakdown
List each line item with the key numbers: product, volume, price paid, EIA benchmark, and the wellhead differential in plain English (e.g. "Operator paid $55.15/bbl vs. EIA WTI $91.38/bbl — a $36.23 wellhead discount, which is within the normal 20–40% range for Permian crude").

## Variance Analysis
If the math check passes and no anomalies are flagged: explain clearly that the payment appears mathematically correct and the price differentials are normal. Describe the most common reasons for wellhead discounts (transportation tariffs, quality adjustments, marketing fees, geographic basis differentials) in 2–3 sentences.
If anomalies were flagged: address only those specific anomalies. Do not fabricate additional concerns.

## Next Steps
2–3 specific, proportionate actions based on the findings above. Calibrate to what was actually found — do not copy-paste generic escalation advice.`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1800,
    system:
      "You are an oil and gas royalty auditing expert. Write concise, accurate reports for mineral rights owners. Use plain English. Be conservative — flag genuine issues, not normal industry practices. Never fabricate numbers or contradictions.",
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "Report generation failed.";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      extraction: Extraction;
      grossProductionVolume?: number;
      volumeSource?: string;
    };

    const { extraction } = body;

    // Fetch EIA prices per unique (product_type, production_month) combo — deduplicated
    const eiaCache = new Map<string, EIAResult | null>();

    const getEIAForItem = async (item: LineItem): Promise<EIAResult | null> => {
      const key = `${item.product_type}:${item.production_month}`;
      if (eiaCache.has(key)) return eiaCache.get(key)!;
      const yyyymm = parseYYYYMM(item.production_month);
      const result = await fetchEIAPrice(item.product_type, yyyymm);
      eiaCache.set(key, result);
      return result;
    };

    // Process each line item
    const lineItemResults: LineItemResult[] = await Promise.all(
      extraction.line_items.map(async (item): Promise<LineItemResult> => {
        const eia = await getEIAForItem(item);

        const wellheadDifferentialPct =
          eia && item.price_per_unit > 0
            ? ((eia.price - item.price_per_unit) / eia.price) * 100
            : null;

        // Internal math: does owner_gross - deductions - taxes ≈ owner_net?
        const computedNet = item.owner_gross - item.owner_deductions - item.taxes;
        const lineItemMathVariance = computedNet - item.owner_net;
        const lineItemMathOk = Math.abs(lineItemMathVariance) < 0.5;

        return {
          item,
          eiaPrice: eia?.price ?? null,
          eiaSeries: eia?.series ?? null,
          eiaUnit: eia?.unit ?? null,
          eiaPeriod: eia?.period ?? null,
          wellheadDifferentialPct,
          lineItemMathOk,
          lineItemMathVariance,
        };
      })
    );

    const sumOwnerNet = extraction.line_items.reduce((s, i) => s + i.owner_net, 0);
    const mathVariance = sumOwnerNet - extraction.net_check_amount;
    const mathOk = Math.abs(mathVariance) < 1.0;

    const narrative = await generateNarrative(
      extraction,
      lineItemResults,
      sumOwnerNet,
      mathVariance,
      mathOk
    );

    const response: AuditResponse = {
      lineItemResults,
      sumOwnerNet,
      mathVariance,
      mathOk,
      narrative,
    };

    return NextResponse.json(response);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Audit failed", detail }, { status: 500 });
  }
}
