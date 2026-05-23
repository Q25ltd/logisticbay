import Anthropic from "@anthropic-ai/sdk";
import { env }   from "./env.js";

/** Lazy singleton — only created when a request actually needs it. */
let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("AI features are not enabled — ANTHROPIC_API_KEY is not set");
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client;
}
