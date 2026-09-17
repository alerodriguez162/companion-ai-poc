import type { CharacterContext, RelationshipStateSnapshot, StoryStateSnapshot } from "@companion/shared";
import { AppError } from "../errors.js";
import { log } from "../logger.js";
import { config } from "../config.js";

export type AiChatPayload = {
  requestId?: string;
  conversationId: string;
  characterId: string;
  character: CharacterContext;
  relationshipState: RelationshipStateSnapshot;
  storyState: StoryStateSnapshot;
  memories: Array<{ id?: string; type: string; content: string; importance: number }>;
  recentMessages: Array<{ role: "USER" | "ASSISTANT" | "SYSTEM"; content: string }>;
  userMessage: string;
};

export type AiTurnUpdate = {
  memories: Array<{ type: string; content: string; importance: number }>;
  storyState: StoryStateSnapshot | null;
  relationshipDelta: { affinityDelta: number; trustDelta: number };
};

export type StreamHandlers = {
  onToken: (token: string) => void;
  onMetrics: (metrics: Record<string, unknown>) => void;
  signal: AbortSignal;
};

async function readSse(
  response: Response,
  handlers: StreamHandlers,
): Promise<{ completed: boolean; error?: string }> {
  if (!response.body) {
    throw new AppError(502, "AI_UNAVAILABLE", "AI service returned an empty body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  let error: string | undefined;
  let eventName = "message";

  while (!handlers.signal.aborted) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    buffer += decoder.decode(chunk.value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
        continue;
      }
      if (!line.startsWith("data:")) {
        continue;
      }
      const data = line.slice(5).trim();
      if (eventName === "token") {
        handlers.onToken(JSON.parse(data) as string);
      } else if (eventName === "metrics") {
        handlers.onMetrics(JSON.parse(data) as Record<string, unknown>);
      } else if (eventName === "error") {
        error = data;
      } else if (eventName === "done") {
        completed = true;
      }
      eventName = "message";
    }
  }

  if (error) {
    return { completed: false, error };
  }
  return { completed };
}

export async function streamAssistant(payload: AiChatPayload, handlers: StreamHandlers): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${config.aiServiceUrl}/v1/chat/stream`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": payload.requestId ?? "" },
      body: JSON.stringify(payload),
      signal: handlers.signal,
    });
  } catch (error) {
    log("error", "ai service unreachable", { requestId: payload.requestId });
    throw new AppError(503, "AI_UNAVAILABLE", "AI service is unreachable");
  }

  if (response.status >= 400) {
    throw new AppError(503, "AI_UNAVAILABLE", `AI service returned HTTP ${response.status}`);
  }

  const result = await readSse(response, handlers);
  if (handlers.signal.aborted) {
    throw new AppError(499, "STREAM_CANCELLED", "Client cancelled the generation");
  }
  if (result.error) {
    throw new AppError(503, "LLM_UNAVAILABLE", result.error);
  }
  if (!result.completed) {
    throw new AppError(503, "LLM_INCOMPLETE", "The model stream ended before completion");
  }
}

export async function requestTurnUpdate(input: {
  conversationId: string;
  characterName: string;
  recentMessages: AiChatPayload["recentMessages"];
  currentStory: StoryStateSnapshot;
  currentRelationship: RelationshipStateSnapshot;
}): Promise<AiTurnUpdate | null> {
  try {
    const response = await fetch(`${config.aiServiceUrl}/v1/turn-update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      log("warn", "turn update failed", { conversationId: input.conversationId, status: response.status });
      return null;
    }
    return (await response.json()) as AiTurnUpdate;
  } catch {
    log("warn", "turn update unreachable", { conversationId: input.conversationId });
    return null;
  }
}

export async function aiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${config.aiServiceUrl}/health`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function llmHealth(): Promise<unknown> {
  try {
    const response = await fetch(`${config.aiServiceUrl}/health/llm`, { signal: AbortSignal.timeout(1500) });
    return await response.json();
  } catch {
    return { status: "unavailable", service: "llm" };
  }
}
