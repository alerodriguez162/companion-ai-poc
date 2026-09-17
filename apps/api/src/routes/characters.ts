import { Router } from "express";
import { asyncHandler } from "../async-handler.js";
import { createCharacterSchema, idParamSchema } from "../config.js";
import { AppError } from "../errors.js";
import { toSharedCharacter } from "../mappers.js";
import { prisma } from "../prisma.js";
import { ensureConversation } from "../services/chat-service.js";

export const charactersRouter = Router();

charactersRouter.get(
  "/characters",
  asyncHandler(async (_req, res) => {
    const characters = await prisma.character.findMany({ orderBy: { createdAt: "asc" } });
    res.json(characters.map(toSharedCharacter));
  }),
);

charactersRouter.post(
  "/characters",
  asyncHandler(async (req, res) => {
    const body = createCharacterSchema.parse(req.body);
    const created = await prisma.character.create({ data: body });
    res.status(201).json(toSharedCharacter(created));
  }),
);

charactersRouter.get(
  "/characters/:characterId",
  asyncHandler(async (req, res) => {
    const characterId = idParamSchema.parse(req.params.characterId);
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { conversations: { orderBy: { updatedAt: "desc" }, take: 5 } },
    });
    if (!character) {
      throw new AppError(404, "CHARACTER_NOT_FOUND", "Character not found");
    }
    res.json({
      ...toSharedCharacter(character),
      conversations: character.conversations.map((item) => ({
        id: item.id,
        updatedAt: item.updatedAt,
      })),
    });
  }),
);

charactersRouter.post(
  "/characters/:characterId/conversations",
  asyncHandler(async (req, res) => {
    const characterId = idParamSchema.parse(req.params.characterId);
    const conversation = await ensureConversation(characterId);
    res.status(201).json({ id: conversation.id, characterId: conversation.characterId });
  }),
);
