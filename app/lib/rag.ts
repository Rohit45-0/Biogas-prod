import { knowledgeChunks, type KnowledgeChunk } from "./knowledge";

let cachedEmbeddings: number[][] | null = null;

function tokenSet(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9.]+/g) ?? []);
}

function lexicalScore(question: string, chunk: KnowledgeChunk) {
  const questionTerms = tokenSet(question);
  const chunkTerms = tokenSet(`${chunk.keywords.join(" ")} ${chunk.text}`);
  let score = 0;
  for (const term of questionTerms) if (chunkTerms.has(term)) score += chunk.keywords.includes(term) ? 3 : 1;
  return score;
}

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm) || 1);
}

async function embed(values: string[], apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: values }),
  });
  if (!response.ok) throw new Error(`Embedding request failed (${response.status})`);
  const body = await response.json() as { data?: { embedding?: number[] }[] };
  const vectors = body.data?.map((item) => item.embedding ?? []) ?? [];
  if (vectors.length !== values.length || vectors.some((vector) => vector.length === 0)) throw new Error("Embedding response was incomplete");
  return vectors;
}

function lexicalRetrieval(question: string) {
  return [...knowledgeChunks]
    .map((chunk) => ({ chunk, score: lexicalScore(question, chunk) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ chunk }) => chunk);
}

export async function retrieveKnowledge(question: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  const lexical = lexicalRetrieval(question);
  if (!apiKey) return { chunks: lexical, retrieval: "keyword" as const };

  try {
    if (!cachedEmbeddings) cachedEmbeddings = await embed(knowledgeChunks.map((chunk) => chunk.text), apiKey);
    const [questionEmbedding] = await embed([question], apiKey);
    const maxLexical = Math.max(1, ...knowledgeChunks.map((chunk) => lexicalScore(question, chunk)));
    const chunks = knowledgeChunks
      .map((chunk, index) => ({ chunk, score: cosine(questionEmbedding, cachedEmbeddings![index]) * 0.8 + (lexicalScore(question, chunk) / maxLexical) * 0.2 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ chunk }) => chunk);
    return { chunks, retrieval: "semantic" as const };
  } catch {
    return { chunks: lexical, retrieval: "keyword" as const };
  }
}
