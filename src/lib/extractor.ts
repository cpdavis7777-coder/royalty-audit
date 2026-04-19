export interface VisionExtractor {
  extractRaw(buffer: Buffer, mimeType: string, fileName: string): Promise<string>;
}

export const EXTRACTION_PROMPT = `You are a petroleum royalty auditing assistant. Extract structured data from a royalty check stub.

Return ONLY a valid JSON object with exactly these keys — no markdown, no explanation:
{
  "operator_name": string,
  "well_name": string,
  "api_number": string,
  "production_month": string,
  "decimal_interest": number,
  "net_volume": number,
  "unit": "bbl" | "mcf",
  "product_type": "oil" | "gas",
  "gross_value": number,
  "total_deductions": number,
  "net_check_amount": number
}

Rules:
- If a string field is not visible, use "".
- If a numeric field is not visible, use 0.
- Convert fractions like "1/8" to decimals (0.125).
- Strip currency symbols and commas from numeric fields.
- unit: "bbl" for oil, "mcf" for natural gas.
- production_month: use format "Month YYYY" e.g. "August 2024".`;
