import { buildCharacterContext } from "@companion/character-engine";
import { rankMemories } from "@companion/memory-engine";
import {
  DEFAULT_RELATIONSHIP_STATE,
  DEFAULT_STORY_STATE,
  MEMORY_TYPES,
  applyRelationshipDelta,
  type MemoryType,
  type StoryStateSnapshot,
} from "@companion/shared";
import type { Prisma } from "@prisma/client";
import type { Response } from "express";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { log } from "../logger.js";
import { toSharedCharacter } from "../mappers.js";
import { prisma } from "../prisma.js";
import { llmHealth, requestTurnUpdate, streamAssistant } from "./ai-client.js";

function asStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function isMemoryType(value: string): value is MemoryType {
  return (MEMORY_TYPES as readonly string[]).includes(value);
}

export async function ensureConversation(characterId: string) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) {
    throw new AppError(404, "CHARACTER_NOT_FOUND", "Character not found");
  }
  const existing = await prisma.conversation.findFirst({
    where: { characterId },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) {
    await prisma.storyState.upsert({
      where: { conversationId: existing.id },
      update: {},
      create: {
        conversationId: existing.id,
        currentScene: DEFAULT_STORY_STATE.currentScene,
        location: DEFAULT_STORY_STATE.location,
        participants: [...DEFAULT_STORY_STATE.participants, character.name],
        activeEvents: DEFAULT_STORY_STATE.activeEvents,
        openThreads: DEFAULT_STORY_STATE.openThreads,
        timelineSummary: DEFAULT_STORY_STATE.timelineSummary,
      },
    });
    await prisma.relationshipState.upsert({
      where: { conversationId: existing.id },
      update: {},
      create: {
        conversationId: existing.id,
        affinity: DEFAULT_RELATIONSHIP_STATE.affinity,
        trust: DEFAULT_RELATIONSHIP_STATE.trust,
        relationshipStage: DEFAULT_RELATIONSHIP_STATE.relationshipStage,
      },
    });
    return existing;
  }
  return prisma.conversation.create({
    data: {
      characterId,
      storyState: {
        create: {
          currentScene: DEFAULT_STORY_STATE.currentScene,
          location: DEFAULT_STORY_STATE.location,
          participants: [...DEFAULT_STORY_STATE.participants, character.name],
          activeEvents: DEFAULT_STORY_STATE.activeEvents,
          openThreads: DEFAULT_STORY_STATE.openThreads,
          timelineSummary: DEFAULT_STORY_STATE.timelineSummary,
        },
      },
      relationshipState: {
        create: {
          affinity: DEFAULT_RELATIONSHIP_STATE.affinity,
          trust: DEFAULT_RELATIONSHIP_STATE.trust,
          relationshipStage: DEFAULT_RELATIONSHIP_STATE.relationshipStage,
        },
      },
    },
  });
}

export async function handleUserMessage(
  conversationId: string,
  content: string,
  res: Response,
  requestId: string,
): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      character: true,
      storyState: true,
      relationshipState: true,
    },
  });
  if (!conversation) {
    throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  }

  const retrievalStarted = Date.now();
  await prisma.message.create({
    data: { conversationId, role: "USER", content },
  });

  const [recent, storedMemories] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: config.recentMessageLimit,
    }),
    prisma.memory.findMany({
      where: { characterId: conversation.characterId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  const chronological = [...recent].reverse();
  const ranked = rankMemories(content, storedMemories, {
    limit: config.memoryRetrievalLimit,
    weights: config.memoryWeights,
  });
  const retrievalMs = Date.now() - retrievalStarted;
  const characterContext = buildCharacterContext(toSharedCharacter(conversation.character));
  const storyState: StoryStateSnapshot = conversation.storyState
    ? {
        currentScene: conversation.storyState.currentScene,
        location: conversation.storyState.location,
        participants: asStringArray(conversation.storyState.participants),
        activeEvents: asStringArray(conversation.storyState.activeEvents),
        openThreads: asStringArray(conversation.storyState.openThreads),
        timelineSummary: conversation.storyState.timelineSummary,
      }
    : {
        ...DEFAULT_STORY_STATE,
        participants: ["User", conversation.character.name],
      };
  const relationshipState = conversation.relationshipState
    ? {
        affinity: conversation.relationshipState.affinity,
        trust: conversation.relationshipState.trust,
        relationshipStage: conversation.relationshipState.relationshipStage,
      }
    : DEFAULT_RELATIONSHIP_STATE;

  const payload = {
    requestId,
    conversationId,
    characterId: conversation.characterId,
    character: characterContext,
    relationshipState,
    storyState,
    memories: ranked.map((memory) => ({
      id: memory.id,
      type: memory.type,
      content: memory.content,
      importance: memory.importance,
    })),
    recentMessages: chronological.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    userMessage: content,
  };

  const approximateContextChars = JSON.stringify(payload).length;
  let assistantText = "";
  let metrics: Record<string, unknown> = {};
  const abort = new AbortController();
  reqOnClose(res, () => abort.abort());

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    await streamAssistant(payload, {
      signal: abort.signal,
      onToken: (token) => {
        assistantText += token;
        writeSse(res, "token", token);
      },
      onMetrics: (value) => {
        metrics = value;
      },
    });
  } catch (error) {
    const message = error instanceof AppError ? error.message : "Generation failed";
    const code = error instanceof AppError ? error.code : "GENERATION_FAILED";
    writeSse(res, "error", { code, message });
    res.end();
    log("warn", "chat stream failed", { conversationId, requestId, code });
    return;
  }

  const assistant = await prisma.message.create({
    data: {
      conversationId,
      role: "ASSISTANT",
      content: assistantText,
      tokenCount: Math.ceil(assistantText.length / 4),
    },
  });

  const debugSnapshot = {
    characterContext,
    relationshipState,
    storyState,
    retrievedMemories: ranked.map((memory) => ({
      id: memory.id,
      type: memory.type,
      content: memory.content,
      importance: memory.importance,
      score: memory.score,
      similarity: memory.similarity,
    })),
    recentMessageCount: chronological.length,
    approximateContextChars,
    retrievalMs,
    metrics,
  };

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastDebug: debugSnapshot as Prisma.InputJsonValue },
  });

  writeSse(res, "done", { messageId: assistant.id, metrics, retrievalMs });
  res.end();

  const totalMessages = chronological.length + 1;
  const shouldExtract =
    totalMessages === 2 || totalMessages % config.memoryExtractionInterval === 0;
  if (shouldExtract) {
    void persistTurnUpdate(conversationId, conversation.character.name, conversation.characterId).catch(
      (error: unknown) => {
        log("warn", "async turn update failed", {
          conversationId,
          message: error instanceof Error ? error.message : "unknown",
        });
      },
    );
  }
}

async function persistTurnUpdate(
  conversationId: string,
  characterName: string,
  characterId: string,
): Promise<void> {
  const [messages, story, relationship] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.storyState.findUnique({ where: { conversationId } }),
    prisma.relationshipState.findUnique({ where: { conversationId } }),
  ]);
  if (!story || !relationship) {
    return;
  }
  const update = await requestTurnUpdate({
    conversationId,
    characterName,
    recentMessages: [...messages].reverse().map((message) => ({
      role: message.role,
      content: message.content,
    })),
    currentStory: {
      currentScene: story.currentScene,
      location: story.location,
      participants: asStringArray(story.participants),
      activeEvents: asStringArray(story.activeEvents),
      openThreads: asStringArray(story.openThreads),
      timelineSummary: story.timelineSummary,
    },
    currentRelationship: {
      affinity: relationship.affinity,
      trust: relationship.trust,
      relationshipStage: relationship.relationshipStage,
    },
  });
  if (!update) {
    return;
  }

  for (const memory of update.memories.slice(0, 6)) {
    if (!isMemoryType(memory.type) || memory.content.trim().length < 3) {
      continue;
    }
    await prisma.memory.create({
      data: {
        characterId,
        conversationId,
        type: memory.type,
        content: memory.content.trim(),
        importance: Math.min(1, Math.max(0, memory.importance)),
      },
    });
  }

  if (update.storyState) {
    await prisma.storyState.update({
      where: { conversationId },
      data: {
        currentScene: update.storyState.currentScene,
        location: update.storyState.location,
        participants: update.storyState.participants,
        activeEvents: update.storyState.activeEvents,
        openThreads: update.storyState.openThreads,
        timelineSummary: update.storyState.timelineSummary,
      },
    });
  }

  const nextRelationship = applyRelationshipDelta(
    {
      affinity: relationship.affinity,
      trust: relationship.trust,
      relationshipStage: relationship.relationshipStage,
    },
    update.relationshipDelta,
  );
  await prisma.relationshipState.update({
    where: { conversationId },
    data: nextRelationship,
  });
}

export async function loadDebug(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      character: true,
      storyState: true,
      relationshipState: true,
      messages: { orderBy: { createdAt: "desc" }, take: config.recentMessageLimit },
      memories: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!conversation) {
    throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  }
  return {
    character: toSharedCharacter(conversation.character),
    characterContext: buildCharacterContext(toSharedCharacter(conversation.character)),
    relationshipState: conversation.relationshipState,
    storyState: conversation.storyState,
    memories: conversation.memories,
    recentMessages: [...conversation.messages].reverse(),
    lastDebug: conversation.lastDebug,
    llm: await llmHealth(),
  };
}

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function reqOnClose(res: Response, onClose: () => void): void {
  res.req.on("close", onClose);
}
