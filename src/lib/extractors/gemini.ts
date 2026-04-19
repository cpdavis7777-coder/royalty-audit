import { GoogleGenerativeAI } from "@google/generative-ai";
import { EXTRACTION_PROMPT, type VisionExtractor } from "@/lib/extractor";

export class GeminiExtractor implements VisionExtractor {
  private model;

  constructor() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    this.model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: EXTRACTION_PROMPT,
      generationConfig: { responseMimeType: "application/json" },
    });
  }

  async extractRaw(buffer: Buffer, mimeType: string, _fileName: string): Promise<string> {
    const effectiveMime = mimeType || "application/octet-stream";
    const result = await this.model.generateContent([
      {
        inlineData: {
          data: buffer.toString("base64"),
          mimeType: effectiveMime,
        },
      },
      "Extract all royalty check fields from this file.",
    ]);
    return result.response.text();
  }
}
