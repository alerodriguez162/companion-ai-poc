import { Router } from "express";
import { asyncHandler } from "../async-handler.js";
import { prisma } from "../prisma.js";
import { aiHealth, llmHealth } from "../services/ai-client.js";

export const healthRouter = Router();

healthRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    let database = "ok";
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = "unavailable";
    }
    const ai = (await aiHealth()) ? "ok" : "unavailable";
    res.json({
      status: database === "ok" ? "ok" : "degraded",
      service: "api",
      database,
      ai,
      llm: await llmHealth(),
    });
  }),
);
