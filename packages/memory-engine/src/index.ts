export const PACKAGE_NAME = "@companion/memory-engine";

export type MemoryScoreWeights = {
  similarity: number;
  importance: number;
  recency: number;
};

export const DEFAULT_MEMORY_SCORE_WEIGHTS: MemoryScoreWeights = {
  similarity: 0.65,
  importance: 0.25,
  recency: 0.1,
};

export type ScoreMemoryInput = {
  similarity: number;
  importance: number;
  recency: number;
  weights?: MemoryScoreWeights;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function scoreMemory(input: ScoreMemoryInput): number {
  const weights = input.weights ?? DEFAULT_MEMORY_SCORE_WEIGHTS;
  return (
    clamp01(input.similarity) * weights.similarity +
    clamp01(input.importance) * weights.importance +
    clamp01(input.recency) * weights.recency
  );
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "is",
  "are",
  "was",
  "it",
  "my",
  "your",
  "i",
  "me",
  "you",
]);

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  );
}

/** Cosine overlap on binary token bags. Fallback when embeddings are unavailable. */
export function lexicalSimilarity(query: string, content: string): number {
  const left = tokenize(query);
  const right = tokenize(content);
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  return intersection / Math.sqrt(left.size * right.size);
}

export function recencyScore(createdAt: Date, now = new Date()): number {
  const ageMs = Math.max(0, now.getTime() - createdAt.getTime());
  const ageDays = ageMs / 86_400_000;
  return Math.exp(-ageDays / 30);
}

export type RankedMemory<T extends { content: string; importance: number; createdAt: Date | string }> = T & {
  score: number;
  similarity: number;
};

export function rankMemories<T extends { content: string; importance: number; createdAt: Date | string }>(
  query: string,
  memories: T[],
  options: {
    limit: number;
    embeddings?: ReadonlyMap<string, number>;
    weights?: MemoryScoreWeights;
    now?: Date;
  },
): RankedMemory<T>[] {
  const now = options.now ?? new Date();
  return memories
    .map((memory) => {
      const createdAt = memory.createdAt instanceof Date ? memory.createdAt : new Date(memory.createdAt);
      const embeddingScore = options.embeddings?.get(memory.content);
      const similarity = embeddingScore ?? lexicalSimilarity(query, memory.content);
      const score = scoreMemory({
        similarity,
        importance: memory.importance,
        recency: recencyScore(createdAt, now),
        ...(options.weights ? { weights: options.weights } : {}),
      });
      return { ...memory, score, similarity };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, options.limit));
}
