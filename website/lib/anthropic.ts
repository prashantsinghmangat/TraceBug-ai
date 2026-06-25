// Server-side Claude call for AI Root-Cause analysis. NEVER import this into
// client code — it reads ANTHROPIC_API_KEY and must only run in route handlers
// (Node runtime). The SDK builds the bug-report prompt client-side
// (src/exporters/ai-prompt.ts) and POSTs it to /api/ai/diagnose; this module
// turns that prompt into a structured diagnosis.

import Anthropic from "@anthropic-ai/sdk";

// Default to the highest-quality model. Override with TRACEBUG_AI_MODEL=claude-sonnet-4-6
// to cut per-analysis cost. Only the models that support structured outputs
// should be used here (Opus 4.8, Sonnet 4.6, Haiku 4.5, Fable 5).
const MODEL = process.env.TRACEBUG_AI_MODEL || "claude-opus-4-8";

export interface BugDiagnosis {
  /** Plain-English explanation of the most likely cause. */
  rootCause: string;
  /** How confident the model is, given the evidence in the report. */
  confidence: "high" | "medium" | "low";
  /**
   * True when the report doesn't contain enough signal to diagnose. When true,
   * rootCause explains what's missing rather than guessing.
   */
  insufficientEvidence: boolean;
  /** Files/components/areas worth inspecting. May be empty. */
  filesToInspect: string[];
  /** A concrete fix suggestion (code where the evidence supports it). */
  suggestedFix: string;
  /** Edge cases worth testing once a fix lands. May be empty. */
  edgeCasesToTest: string[];
}

export interface DiagnoseResult {
  diagnosis: BugDiagnosis;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

/** Raised when ANTHROPIC_API_KEY is not configured. Mapped to a 503 by the route. */
export class AiNotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not configured");
    this.name = "AiNotConfiguredError";
  }
}

/** Raised when the model declines to answer (safety refusal). Mapped to 422. */
export class AiRefusalError extends Error {
  constructor() {
    super("The model declined to analyze this report");
    this.name = "AiRefusalError";
  }
}

// JSON Schema for the structured output. Note the structured-outputs constraints:
// additionalProperties must be false, and length/numeric constraints aren't
// supported — keep it to types + enum.
const DIAGNOSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    rootCause: {
      type: "string",
      description:
        "The single most likely root cause, in plain English, grounded in the evidence provided. If the evidence is insufficient, explain what's missing instead of guessing.",
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "Confidence given only the evidence in the report.",
    },
    insufficientEvidence: {
      type: "boolean",
      description: "True if the report lacks enough signal to diagnose the cause.",
    },
    filesToInspect: {
      type: "array",
      items: { type: "string" },
      description:
        "Files, components, or code areas worth inspecting. Only include names that appear in or are strongly implied by the evidence — do not invent file paths.",
    },
    suggestedFix: {
      type: "string",
      description: "A concrete fix suggestion. Include code only when the evidence supports it.",
    },
    edgeCasesToTest: {
      type: "array",
      items: { type: "string" },
      description: "Edge cases worth testing once the fix lands.",
    },
  },
  required: [
    "rootCause",
    "confidence",
    "insufficientEvidence",
    "filesToInspect",
    "suggestedFix",
    "edgeCasesToTest",
  ],
} as const;

const SYSTEM_PROMPT = `You are TraceBug's debugging assistant. You receive a structured bug report \
(console errors, network failures, reproduction steps, environment, recent user actions) and explain \
WHY the bug most likely happened, then how to fix it.

Rules:
- Ground every claim in the evidence in the report. Do not invent error messages, stack frames, file \
paths, or API endpoints that aren't present or strongly implied.
- If the report doesn't contain enough signal to determine a cause, set insufficientEvidence to true, \
set confidence to "low", and use rootCause to say what additional information would help.
- Prefer one precise cause over several vague possibilities.
- Keep suggestedFix concrete and minimal. Only include code when the evidence clearly supports it.
- filesToInspect should name only files/components that appear in or are strongly implied by the \
evidence; leave it empty rather than guessing.`;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiNotConfiguredError();
  if (!_client) _client = new Anthropic();
  return _client;
}

/**
 * Analyze a pre-built bug-report prompt and return a structured diagnosis.
 * Uses adaptive thinking + medium effort to balance diagnosis quality against
 * the per-call cost of a metered feature. Non-streaming: the structured output
 * is small and bounded by max_tokens.
 */
export async function diagnoseBug(prompt: string): Promise<DiagnoseResult> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", name: "bug_diagnosis", schema: DIAGNOSIS_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
    // output_config is a current Messages API field; SDK type defs may lag the
    // release, so widen the params type rather than fight stale generics.
  } as Anthropic.MessageCreateParamsNonStreaming);

  // Cast guards against SDK type-version drift in the stop_reason union.
  if ((response.stop_reason as string) === "refusal") throw new AiRefusalError();

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!textBlock) {
    throw new Error("Model returned no text block for the diagnosis");
  }

  const diagnosis = JSON.parse(textBlock.text) as BugDiagnosis;

  return {
    diagnosis,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    model: response.model,
  };
}
