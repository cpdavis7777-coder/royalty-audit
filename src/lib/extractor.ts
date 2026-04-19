export interface VisionExtractor {
  extractRaw(buffer: Buffer, mimeType: string, fileName: string): Promise<string>;
}

export const EXTRACTION_PROMPT = `You are a petroleum royalty auditing assistant. Extract ALL line items from a royalty check stub.

Royalty stubs frequently contain MULTIPLE rows — one per production month × product type combination. A single stub may show oil, gas, AND plant products (NGLs) across one or more months, each as its own row. Extract EVERY row — do not skip any.

Return ONLY valid JSON — no markdown, no explanation:
{
  "operator_name": string,
  "well_name": string,
  "api_number": string,
  "decimal_interest": number,
  "net_check_amount": number,
  "line_items": [
    {
      "production_month": string,
      "product_type": "oil" | "gas" | "ngl",
      "unit": "bbl" | "mcf" | "gal",
      "owner_volume": number,
      "price_per_unit": number,
      "owner_gross": number,
      "owner_deductions": number,
      "taxes": number,
      "owner_net": number
    }
  ]
}

Top-level fields:
- decimal_interest: the royalty owner's decimal interest fraction (e.g. 0.00125). Convert fractions like "1/8" to 0.125.
- net_check_amount: the TOTAL check amount at the bottom — the sum of all line items' net amounts.

Per line_item (one entry per production-month × product row on the stub):
- production_month: "Month YYYY" e.g. "November 2018". Use the production period, not the check date.
- product_type: "oil" for crude/condensate, "gas" for natural gas, "ngl" for plant products / NGLs / liquids
- unit: "bbl" for oil and NGLs, "mcf" for gas, "gal" if gallons are explicitly shown
- owner_volume: royalty owner's net allocated volume for this row (after decimal interest)
- price_per_unit: the per-unit price shown on the stub for this row; use 0 if not printed
- owner_gross: gross dollar value for this row before deductions and taxes
- owner_deductions: post-production deductions for this row only (gathering, compression, transport, marketing)
- taxes: production, severance, or ad valorem taxes for this row only
- owner_net: net amount = owner_gross - owner_deductions - taxes

General rules:
- Strip all $ signs and commas from every numeric field.
- If a string field is not visible, use "".
- If a numeric field is not visible or not applicable, use 0.
- The sum of all owner_net values should equal net_check_amount.`;
