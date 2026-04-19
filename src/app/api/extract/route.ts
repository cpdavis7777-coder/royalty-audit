import { NextRequest, NextResponse } from "next/server";
import { getExtractor } from "@/lib/extractors";
import { ExtractionSchema } from "@/types/extraction";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
]);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type) && !file.name.toLowerCase().endsWith(".heic")) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF or image (JPG, PNG, HEIC, WebP)." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extractor = getExtractor();
    const rawText = await extractor.extractRaw(buffer, file.type, file.name);

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
