import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ExtractionSchema } from "@/types/extraction";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a petroleum royalty auditing assistant. Your job is to extract structured data from royalty check stubs.

Extract the following fields and return them as a valid JSON object with exactly these keys:
- operator_name: string (the oil/gas company issuing the check)
- well_name: string (the name of the well)
- api_number: string (the API well number, typically formatted as XX-XXX-XXXXX-XX)
- production_month: string (the month/year of production, e.g. "August 2024" or "2024-08")
- decimal_interest: number (the owner's decimal interest or royalty fraction, e.g. 0.125 for 1/8)
- net_volume: number (the net volume attributed to the owner's interest, numeric only)
- unit: "bbl" or "mcf" (barrel for oil, mcf for natural gas)
- product_type: "oil" or "gas"
- gross_value: number (gross value before deductions, numeric only, no $ sign)
- total_deductions: number (total of all deductions, numeric only)
- net_check_amount: number (the final check amount paid, numeric only)

Rules:
- Return ONLY valid JSON, no markdown, no explanation.
- If a field is not visible or not applicable, use null for strings and 0 for numbers (except decimal_interest which should be 0 if not found).
- Convert fractions like "1/8" to decimals (0.125).
- Strip currency symbols and commas from numeric fields.
- If unit is ambiguous, default to "bbl" for oil and "mcf" for gas.`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"];
    if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith(".heic")) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF or image (JPG, PNG, HEIC, WebP)." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    // Claude Vision supports image types directly; PDFs require the document source type
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    type MessageContent = Anthropic.Messages.TextBlockParam | Anthropic.Messages.ImageBlockParam | Anthropic.Messages.DocumentBlockParam;

    const content: MessageContent[] = isPdf
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          } as Anthropic.Messages.DocumentBlockParam,
          {
            type: "text",
            text: "Extract all royalty check fields from this document and return them as a JSON object per the schema in your instructions.",
          },
        ]
      : [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: base64,
            },
          } as Anthropic.Messages.ImageBlockParam,
          {
            type: "text",
            text: "Extract all royalty check fields from this image and return them as a JSON object per the schema in your instructions.",
          },
        ];

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const rawText = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText.trim());
    } catch {
      return NextResponse.json(
        { error: "Model returned non-JSON response", raw: rawText },
        { status: 422 }
      );
    }

    const validated = ExtractionSchema.safeParse(parsed);
    if (!validated.success) {
      return NextResponse.json(
        { error: "Extraction did not match expected schema", details: validated.error.issues, raw: parsed },
        { status: 422 }
      );
    }

    return NextResponse.json({ data: validated.data });
  } catch (err) {
    console.error("[/api/extract]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
