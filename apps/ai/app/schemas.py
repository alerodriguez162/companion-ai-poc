from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class CharacterContext(BaseModel):
    identity: str
    personality: str
    background: str
    speakingStyle: str
    behavioralTraits: list[str]
    scenario: str


class RelationshipState(BaseModel):
    affinity: int = Field(ge=0, le=100)
    trust: int = Field(ge=0, le=100)
    relationshipStage: Literal["STRANGER", "ACQUAINTANCE", "FRIEND", "CLOSE_FRIEND"]


class StoryState(BaseModel):
    currentScene: str
    location: str
    participants: list[str]
    activeEvents: list[str]
    openThreads: list[str]
    timelineSummary: str


class MemoryItem(BaseModel):
    id: str | None = None
    type: str
    content: str
    importance: float = Field(ge=0, le=1)


class ChatMessage(BaseModel):
    role: Literal["USER", "ASSISTANT", "SYSTEM"]
    content: str


class ChatRequest(BaseModel):
    requestId: str | None = None
    conversationId: str
    characterId: str
    character: CharacterContext
    relationshipState: RelationshipState
    storyState: StoryState
    memories: list[MemoryItem]
    recentMessages: list[ChatMessage]
    userMessage: str


class ExtractedMemory(BaseModel):
    type: Literal[
        "USER_FACT",
        "CHARACTER_FACT",
        "RELATIONSHIP_EVENT",
        "STORY_EVENT",
        "PREFERENCE",
        "PROMISE",
        "IMPORTANT_EVENT",
    ]
    content: str = Field(min_length=3, max_length=400)
    importance: float = Field(ge=0, le=1)


class MemoryExtractionResult(BaseModel):
    memories: list[ExtractedMemory] = Field(default_factory=list)


class RelationshipDelta(BaseModel):
    affinityDelta: int = Field(ge=-5, le=5)
    trustDelta: int = Field(ge=-5, le=5)


class PostTurnUpdate(BaseModel):
    memories: list[ExtractedMemory] = Field(default_factory=list)
    storyState: StoryState | None = None
    relationshipDelta: RelationshipDelta = Field(
        default_factory=lambda: RelationshipDelta(affinityDelta=0, trustDelta=0)
    )


class ExtractRequest(BaseModel):
    conversationId: str
    characterName: str
    recentMessages: list[ChatMessage]
    currentStory: StoryState
    currentRelationship: RelationshipState


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=32)


class InferenceMetrics(BaseModel):
    promptConstructionMs: float
    llmTimeToFirstTokenMs: float | None = None
    totalGenerationMs: float
    approximateContextChars: int
    model: str
    extra: dict[str, Any] = Field(default_factory=dict)
