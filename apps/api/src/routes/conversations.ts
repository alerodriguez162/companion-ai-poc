import { Router } from "express";
import { asyncHandler } from "../async-handler.js";
import { createMessageSchema, idParamSchema } from "../config.js";
import { AppError } from "../errors.js";
import { prisma } from "../prisma.js";
import { handleUserMessage, loadDebug } from "../services/chat-service.js";

export const conversationsRouter = Router();

conversationsRouter.get(
  "/conversations/:conversationId",
  asyncHandler(async (req, res) => {
    const conversationId = idParamSchema.parse(req.params.conversationId);
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        character: true,
      },
    });
    if (!conversation) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
    }
    res.json({
      id: conversation.id,
      characterId: conversation.characterId,
      characterName: conversation.character.name,
      messages: conversation.messages,
    });
  }),
);

conversationsRouter.post(
  "/conversations/:conversationId/messages",
  asyncHandler(async (req, res) => {
    const conversationId = idParamSchema.parse(req.params.conversationId);
    const body = createMessageSchema.parse(req.body);
    await handleUserMessage(conversationId, body.content, res, req.requestId);
  }),
);

conversationsRouter.get(
  "/conversations/:conversationId/debug",
  asyncHandler(async (req, res) => {
    const conversationId = idParamSchema.parse(req.params.conversationId);
    res.json(await loadDebug(conversationId));
  }),
);
