import { z } from "zod";

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: Number.parseInt(process.env.API_PORT ?? "3001", 10),
  logLevel: process.env.LOG_LEVEL ?? "info",
  aiServiceUrl: (process.env.AI_SERVICE_URL ?? "http://localhost:8000").replace(/\/$/, ""),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  recentMessageLimit: Math.max(1, Math.trunc(numberFromEnv(process.env.RECENT_MESSAGE_LIMIT, 20))),
  memoryExtractionInterval: Math.max(1, Math.trunc(numberFromEnv(process.env.MEMORY_EXTRACTION_INTERVAL, 10))),
  memoryRetrievalLimit: Math.max(1, Math.trunc(numberFromEnv(process.env.MEMORY_RETRIEVAL_LIMIT, 8))),
  memoryWeights: {
    similarity: numberFromEnv(process.env.MEMORY_SCORE_SIMILARITY_WEIGHT, 0.65),
    importance: numberFromEnv(process.env.MEMORY_SCORE_IMPORTANCE_WEIGHT, 0.25),
    recency: numberFromEnv(process.env.MEMORY_SCORE_RECENCY_WEIGHT, 0.1),
  },
  maxUserMessageLength: 4000,
  nodeEnv: process.env.NODE_ENV ?? "development",
};

export const characterTraitsSchema = z.record(z.string().min(1).max(40), z.number().min(0).max(1));

export const createCharacterSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  personality: z.string().trim().min(1).max(1000),
  background: z.string().trim().min(1).max(2000),
  speakingStyle: z.string().trim().min(1).max(1000),
  scenario: z.string().trim().min(1).max(1000),
  traits: characterTraitsSchema.default({}),
});

export const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(config.maxUserMessageLength),
});

export const idParamSchema = z.string().uuid();
