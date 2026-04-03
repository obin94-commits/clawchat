import crypto from 'crypto';

export interface MemoryResult {
  id: string;
  content: string;
  score: number;
  category?: string;
  userId?: string;
}

interface QdrantSearchHit {
  id: string | number;
  score: number;
  payload?: {
    content?: string;
    category?: string;
    userId?: string;
    [key: string]: unknown;
  };
}

interface QdrantSearchResponse {
  result: QdrantSearchHit[];
}

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

export class MemoryService {
  private readonly qdrantUrl: string;
  private readonly collection = 'newt_memories';
  private readonly openaiKey: string;

  constructor() {
    this.qdrantUrl = process.env.QDRANT_URL ?? 'http://100.93.134.22:6333';
    this.openaiKey = process.env.OPENAI_API_KEY ?? '';
  }

  private async embed(text: string): Promise<number[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openaiKey}`,
      },
      body: JSON.stringify({ input: text, model: 'text-embedding-3-small' }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI embedding failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as OpenAIEmbeddingResponse;
    return data.data[0].embedding;
  }

  async search(query: string, userId: string): Promise<MemoryResult[]> {
    const vector = await this.embed(query);

    const body: Record<string, unknown> = { vector, limit: 10, with_payload: true };
    if (userId) {
      body.filter = { must: [{ key: 'userId', match: { value: userId } }] };
    }

    const res = await fetch(
      `${this.qdrantUrl}/collections/${this.collection}/points/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      throw new Error(`Qdrant search failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as QdrantSearchResponse;

    return data.result.map((hit) => ({
      id: String(hit.id),
      content: hit.payload?.content ?? '',
      score: hit.score,
      category: hit.payload?.category,
      userId: hit.payload?.userId,
    }));
  }

  async store(content: string, userId: string, metadata: Record<string, unknown>): Promise<string> {
    const vector = await this.embed(content);
    const id = crypto.randomUUID();

    const res = await fetch(`${this.qdrantUrl}/collections/${this.collection}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [{ id, vector, payload: { content, userId, ...metadata, createdAt: Date.now() } }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Qdrant upsert failed: ${res.status} ${await res.text()}`);
    }

    return id;
  }

  async searchMemories(query: string, userId: string, limit = 5): Promise<MemoryResult[]> {
    const results = await this.search(query, userId);
    return results.slice(0, limit);
  }

  async addMemory(content: string, userId: string, metadata: Record<string, unknown> = {}): Promise<string> {
    return this.store(content, userId, metadata);
  }

  async getRelevant(threadId: string, lastMessage: string): Promise<MemoryResult[]> {
    try {
      const vector = await this.embed(lastMessage);

      const body: Record<string, unknown> = {
        vector,
        limit: 10,
        with_payload: true,
        filter: {
          must: [
            { key: 'threadId', match: { value: threadId } },
          ],
        },
      };

      const res = await fetch(
        `${this.qdrantUrl}/collections/${this.collection}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        throw new Error(`Qdrant search failed: ${res.status} ${await res.text()}`);
      }

      const data = (await res.json()) as QdrantSearchResponse;
      return data.result
        .map((hit) => ({
          id: String(hit.id),
          content: hit.payload?.content ?? '',
          score: hit.score,
          category: hit.payload?.category,
          userId: hit.payload?.userId,
        }))
        .filter((r) => r.score > 0.7);
    } catch (error) {
      console.error('[memory] getRelevant failed:', error);
      return [];
    }
  }
}
