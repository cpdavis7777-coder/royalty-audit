import { type VisionExtractor } from "@/lib/extractor";

export function getExtractor(): VisionExtractor {
  const provider = process.env.AI_PROVIDER ?? "gemini";

  if (provider === "gemini") {
    const { GeminiExtractor } = require("./gemini");
    return new GeminiExtractor();
  }

  if (provider === "claude") {
    const { ClaudeExtractor } = require("./claude");
    return new ClaudeExtractor();
  }

  throw new Error(`Unknown AI_PROVIDER "${provider}". Valid values: "gemini", "claude".`);
}
