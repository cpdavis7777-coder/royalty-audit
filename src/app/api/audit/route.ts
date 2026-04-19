import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { type Extraction } from "@/types/extraction";

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

async function fetchEIAPrice(
  productType: "oil" | "gas",
  yyyymm: string
): Promise<EIAResult | null> {
  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) return null;

  // Series IDs via EIA v2 seriesid endpoint (backward-compatible)
  const seriesId = productType === "oil" ? "PET.RWTC.M" : "NG.RNGWHHD.M";
  const priceUnit = productType === "oil" ? "$/bbl" : "$/MMBtu";

  // Try the target month; if no data, try one month earlier (price lags publication)
  for (const offset of [0, -1, -2]) {
    const [year, month] = yyyymm.split("-").map(Number);
    const d = new Date(year, month - 1 + offset, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    try {
      const url = `https://api.eia.gov/v2/seriesid/${seriesId}?api_key=${apiKey}&start=${period}&end=${period}&offset=0&length=1`;
      const res = await fetch(url, { next: { revalidate: 3600 } });
      if (!res.ok) continue;

      const json = (await res.json()) as {
        response?: { data?: Array<{ period: string; value: string | number }> };
      };

      const row = json.response?.data?.[0];
      if (!row) continue;

      const price = parseFloat(String(row.value));
      if (!isNaN(price) && price > 0) {
        return { price, series: seriesId, unit: priceUnit, period };
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function generateNarrative(params: {
  extraction: Extraction;
  grossProductionVolume: number;
  volumeSource: string;
  royaltyVolume: number;
  eiaPrice: number | null;
  eiaSeries: string | null;
  priceUnit: string | null;
  eiaPeriod: string | null;
  expectedGrossValue: number;
  expectedNet: number;
  variance: number;
  variancePct: number;
}): Promise<string> {
  const client = new Anthropic();

  const withinRange = Math.abs(params.variancePct) <= 5;
  const direction = params.variance < 0 ? "POSSIBLE UNDERPAYMENT" : "POSSIBLE OVERPAYMENT";
  const status = withinRange ? "WITHIN NORMAL RANGE (±5%)" : direction;

  const prompt = `Generate a royalty audit report. Be direct and accessible — the reader owns mineral rights but is not a petroleum engineer.

STUB DATA:
- Operator: ${params.extraction.operator_name || "(not extracted)"}
- Well: ${params.extraction.well_name || "(not extracted)"}
- Production Month: ${params.extraction.production_month}
- Product: ${params.extraction.product_type.toUpperCase()} (${params.extraction.unit})
- Decimal Interest: ${params.extraction.decimal_interest} (${(params.extraction.decimal_interest * 100).toFixed(4)}%)
- Net Volume on Stub: ${params.extraction.net_volume} ${params.extraction.unit}
- Gross Value on Stub: $${params.extraction.gross_value.toFixed(2)}
- Total Deductions on Stub: $${params.extraction.total_deductions.toFixed(2)}
- Net Check Amount: $${params.extraction.net_check_amount.toFixed(2)}

PRODUCTION DATA (source: ${params.volumeSource}):
- Gross Production Volume: ${params.grossProductionVolume} ${params.extraction.unit}
- Your Royalty Share (× decimal interest): ${params.royaltyVolume.toFixed(4)} ${params.extraction.unit}

BENCHMARK PRICE:
${
  params.eiaPrice
    ? `- ${params.extraction.product_type === "oil" ? "WTI Cushing Spot Price" : "Henry Hub Spot Price"} for ${params.eiaPeriod} (EIA ${params.eiaSeries}): $${params.eiaPrice.toFixed(2)} ${params.priceUnit}`
    : "- EIA price data unavailable — analysis uses stub gross value as benchmark"
}

AUDIT CALCULATION:
- Expected Gross Value: $${params.expectedGrossValue.toFixed(2)}
- Less Reported Deductions: $${params.extraction.total_deductions.toFixed(2)}
- Expected Net Royalty: $${params.expectedNet.toFixed(2)}
- Actual Net Check: $${params.extraction.net_check_amount.toFixed(2)}
- Variance: ${params.variance >= 0 ? "+" : ""}$${params.variance.toFixed(2)} (${params.variancePct >= 0 ? "+" : ""}${params.variancePct.toFixed(1)}%)
- Overall Status: ${status}

Write the report using EXACTLY these four sections with these exact headers:

## Summary
2–3 sentences. What we found, whether the payment appears correct, and the bottom line.

## Expected vs. Actual
A clear side-by-side breakdown of the key numbers.

## Variance Analysis
Plain-English explanation of what could explain any gap. Common causes: price timing (operators often use a prior-month price), post-production deductions (gathering, compression, transportation, marketing), BTU adjustments for gas, volume measurement differences, and royalty payment lag. If variance is within 5%, say so and explain it's likely normal rounding/timing.

## Next Steps
2–3 specific, actionable items. If variance > 5% and underpayment, recommend requesting a division order audit. If within range, what to watch next month.`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system:
      "You are an oil and gas royalty auditing expert. Write concise, direct reports for mineral rights owners. Use plain English. Avoid jargon unless you explain it.",
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "Report generation failed.";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      extraction: Extraction;
      grossProductionVolume: number;
      volumeSource: string;
    };

    const { extraction, grossProductionVolume, volumeSource } = body;

    // Parse "August 2024" → "2024-08"
    const parts = (extraction.production_month ?? "").split(" ");
    const monthNum = MONTH_MAP[parts[0]] ?? "01";
    const yyyymm = `${parts[1] ?? "0000"}-${monthNum}`;

    // Fetch EIA benchmark price
    const eiaResult = await fetchEIAPrice(extraction.product_type, yyyymm);

    // Royalty volume = gross production × decimal interest
    const royaltyVolume =
      grossProductionVolume > 0
        ? grossProductionVolume * extraction.decimal_interest
        : extraction.net_volume;

    // Expected gross value
    let expectedGrossValue: number;
    if (eiaResult) {
      expectedGrossValue = royaltyVolume * eiaResult.price;
    } else {
      // No EIA price — use stub's own gross_value as the benchmark
      expectedGrossValue = extraction.gross_value;
    }

    const expectedNet = Math.max(0, expectedGrossValue - extraction.total_deductions);
    const variance = expectedNet - extraction.net_check_amount;
    const variancePct =
      extraction.net_check_amount !== 0
        ? (variance / extraction.net_check_amount) * 100
        : 0;

    const narrative = await generateNarrative({
      extraction,
      grossProductionVolume,
      volumeSource,
      royaltyVolume,
      eiaPrice: eiaResult?.price ?? null,
      eiaSeries: eiaResult?.series ?? null,
      priceUnit: eiaResult?.unit ?? null,
      eiaPeriod: eiaResult?.period ?? null,
      expectedGrossValue,
      expectedNet,
      variance,
      variancePct,
    });

    return NextResponse.json({
      eiaPrice: eiaResult?.price ?? null,
      eiaSeries: eiaResult?.series ?? null,
      priceUnit: eiaResult?.unit ?? null,
      eiaPeriod: eiaResult?.period ?? null,
      royaltyVolume,
      expectedGrossValue,
      expectedNet,
      variance,
      variancePct,
      narrative,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Audit failed", detail }, { status: 500 });
  }
}
