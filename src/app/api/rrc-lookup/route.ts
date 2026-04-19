import { NextRequest, NextResponse } from "next/server";

const MONTH_MAP: Record<string, string> = {
  January: "01", February: "02", March: "03", April: "04",
  May: "05", June: "06", July: "07", August: "08",
  September: "09", October: "10", November: "11", December: "12",
};

async function tryRRCFetch(params: {
  api_number: string;
  yyyymm: string;
}): Promise<{ volume: number; unit: string } | null> {
  const { api_number, yyyymm } = params;

  // Need a usable API number
  const cleanApi = api_number.replace(/\D/g, "");
  if (cleanApi.length < 6) return null;

  const [year, month] = yyyymm.split("-");
  if (!year || !month) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    // RRC PDQ production query servlet — parameters from observed URL structure
    const url = new URL("https://webapps.rrc.texas.gov/PDQ/servlet/querySQLGate");
    url.searchParams.set("startRow", "1");
    url.searchParams.set("apiNo", cleanApi);
    url.searchParams.set("prodYear", year);
    url.searchParams.set("prodMonth", month);
    url.searchParams.set("reportType", "OIL");

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; royalty-audit/1.0; +https://truebarrel.com)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    clearTimeout(timer);
    if (!res.ok) return null;

    const html = await res.text();

    // Look for volume numbers adjacent to unit labels in the HTML table
    const volPattern = />([\d,]+\.?\d*)\s*<\/td>\s*<td[^>]*>\s*(Bbls?|MCF|Mcf|bbl|mcf)/gi;
    const match = volPattern.exec(html);
    if (match) {
      const volume = parseFloat(match[1].replace(/,/g, ""));
      const unit = /mcf/i.test(match[2]) ? "mcf" : "bbl";
      if (volume > 0) return { volume, unit };
    }

    // Fallback: any number followed by unit word
    const loose = html.match(/([\d,]{3,}\.?\d*)\s*(?:Bbls?|MCF|bbls?|mcf)/i);
    if (loose) {
      const volume = parseFloat(loose[1].replace(/,/g, ""));
      if (volume > 0) {
        const unit = /mcf/i.test(loose[0]) ? "mcf" : "bbl";
        return { volume, unit };
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { operator_name, well_name, api_number, production_month } = (await req.json()) as {
      operator_name: string;
      well_name: string;
      api_number: string;
      production_month: string;
    };

    // "August 2024" → "2024-08"
    const parts = (production_month ?? "").split(" ");
    const monthNum = MONTH_MAP[parts[0]] ?? "01";
    const yyyymm = `${parts[1] ?? "0000"}-${monthNum}`;

    const rrc = await tryRRCFetch({ api_number: api_number ?? "", yyyymm });

    if (rrc) {
      return NextResponse.json({
        status: "found",
        volume: rrc.volume,
        unit: rrc.unit,
        source: "Texas RRC Production Data Query",
        label: "Found in RRC data",
      });
    }

    // Graceful fallback — RRC system requires interactive session or JS rendering
    void operator_name;
    void well_name;
    return NextResponse.json({
      status: "manual",
      label: "Manually entered",
      message:
        "Automated RRC lookup is temporarily unavailable — the production data system requires an interactive session. Please enter the gross production volume for the month manually.",
    });
  } catch {
    return NextResponse.json({
      status: "manual",
      label: "Manually entered",
      message: "RRC lookup encountered an error. Please enter production volume manually.",
    });
  }
}
