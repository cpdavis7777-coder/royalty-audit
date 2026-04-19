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
    : `FAILS — sum of line items ($${sumOwnerNet.toFixed(2)}) differs from check amount ($${extraction.net_check_amount.toFixed(2)}) by $${Math.abs(mathVariance).toFixed(2)}. This likely indicates a missing line item or an extraction imprecision — NOT necessarily a payment error.`;

  const prompt = `Generate a royalty audit report for the following stub. Be conservative and accurate — only reference numbers explicitly provided below. Do not calculate or invent additional figures.

STUB OVERVIEW:
- Operator: ${extraction.operator_name || "(not extracted)"}
- Well: ${extraction.well_name || "(not extracted)"}
- API Number: ${extraction.api_number || "(not extracted)"}
- Decimal Interest: ${extraction.decimal_interest} (${(extraction.decimal_interest * 100).toFixed(4)}%)
- Total Net Check: $${extraction.net_check_amount.toFixed(2)}
- Line Items Extracted: ${extraction.line_items.length}

LINE ITEMS (with EIA benchmark comparison):
${lineRows}

MATH CHECK:
${mathNote}

IMPORTANT CONTEXT FOR THE REPORT:
1. Wellhead price discounts of 20–45% below WTI (for oil) or Henry Hub (for gas) are NORMAL. Operators pay the wellhead price, not the exchange benchmark. Do NOT flag a normal differential as an underpayment.
2. If the math check passes, the payment is mathematically consistent with the stub.
3. If a field appears anomalous (e.g. price seems very low or very high for the basin), note it as something to "verify with the operator" — not as evidence of wrongdoing.
4. Trust the numbers the user has provided. Do not invent contradictions or call the stub "inconsistent."
5. Next steps should be neutral and investigative, not alarmist. Only suggest contacting an attorney for clear systematic errors, not for normal price differentials.

Write the report with EXACTLY these four sections:

## Summary
2–3 sentences. State whether the stub math checks out, and whether the prices paid are within a normal wellhead range. Be direct and neutral.

## Line Item Breakdown
For each line item: the product, volume, price paid, EIA benchmark (if available), and the wellhead differential. Explain in one sentence that wellhead prices are always lower than exchange benchmarks due to transportation, quality, and location adjustments.

## Variance Analysis
Explain any meaningful differences. If the math check passes and differentials are normal (15–50% below benchmark), say so clearly — this is not a red flag. If something is genuinely outside normal range, describe it neutrally as "worth a follow-up."

## Next Steps
2–3 specific, proportionate actions. If everything looks normal: suggest confirming decimal interest on the division order and tracking next month's prices. If there's an anomaly: suggest requesting a pricing statement or run ticket from the operator. Do NOT recommend attorneys, demand letters, or formal audits unless there is a clear systematic error.`;

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
