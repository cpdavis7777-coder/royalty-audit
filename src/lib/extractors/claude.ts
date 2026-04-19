import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_PROMPT, type VisionExtractor } from "@/lib/extractor";

export class ClaudeExtractor implements VisionExtractor {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async extractRaw(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
    const base64 = buffer.toString("base64");
    const isPdf = mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

    type Content =
      | Anthropic.Messages.TextBlockParam
      | Anthropic.Messages.ImageBlockParam
      | Anthropic.Messages.DocumentBlockParam;

    const content: Content[] = isPdf
      ? [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          } as Anthropic.Messages.DocumentBlockParam,
          { type: "text", text: "Extract all royalty check fields from this document." },
        ]
      : [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: base64,
            },
          } as Anthropic.Messages.ImageBlockParam,
          { type: "text", text: "Extract all royalty check fields from this image." },
        ];

    const response = await this.client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: EXTRACTION_PROMPT,
      messages: [{ role: "user", content }],
    });

    return response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
}
