import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { EXTRACTION_PROMPT, type VisionExtractor } from "@/lib/extractor";

export class GeminiExtractor implements VisionExtractor {
  private model;
  private fileManager;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY!;
    const genAI = new GoogleGenerativeAI(apiKey);
    this.fileManager = new GoogleAIFileManager(apiKey);
    this.model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: EXTRACTION_PROMPT,
      generationConfig: { responseMimeType: "application/json" },
    });
  }

  async extractRaw(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
    const effectiveMime = mimeType || "application/octet-stream";

    // PDFs must go through the Files API — inline data only supports images
    if (effectiveMime === "application/pdf") {
      return this.extractPdfViaFilesApi(buffer, fileName);
    }

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

  private async extractPdfViaFilesApi(buffer: Buffer, fileName: string): Promise<string> {
    let uploadedFileName: string | null = null;

    try {
      const uploadResult = await this.fileManager.uploadFile(buffer, {
        mimeType: "application/pdf",
        displayName: fileName,
      });

      uploadedFileName = uploadResult.file.name;
      let file = uploadResult.file;

      // Poll until Gemini finishes processing the file
      while (file.state === FileState.PROCESSING) {
        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
        file = await this.fileManager.getFile(file.name);
      }

      if (file.state !== FileState.ACTIVE) {
        throw new Error(`PDF processing failed with state: ${file.state}`);
      }

      const result = await this.model.generateContent([
        {
          fileData: {
            fileUri: file.uri,
            mimeType: "application/pdf",
          },
        },
        "Extract all royalty check fields from this file.",
      ]);

      return result.response.text();
    } finally {
      if (uploadedFileName) {
        this.fileManager.deleteFile(uploadedFileName).catch(() => {});
      }
    }
  }
}
