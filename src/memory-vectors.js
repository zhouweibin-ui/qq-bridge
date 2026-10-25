// BGE runs locally inside the existing memory worker. No API keys or model server.
export const BGE_MODEL = 'BAAI/bge-small-zh-v1.5:q8:cls:75c43b069aac4d136ba6bc1122f995fedcfd2781';
export const BGE_DIMENSIONS = 512;
export const BGE_QUERY_PREFIX = '为这个句子生成表示以用于检索相关文章：';

export function splitMemoryText(text, size = 320, overlap = 40) {
  const chunks = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + size, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1])) end--;
    chunks.push({ offset: start, text: text.slice(start, end) });
    if (end === text.length) break;
    start = end - overlap;
    if (/[\uDC00-\uDFFF]/u.test(text[start])) start--;
  }
  return chunks;
}

export function cosineNormalized(a, b) {
  if (a.length !== b.length) throw new Error('向量维度不匹配');
  let score = 0;
  for (let i = 0; i < a.length; i++) score += a[i] * b[i];
  return score;
}

// Reciprocal rank fusion keeps exact keyword matches and semantic matches together.
export function fuseMemoryRanks(keyword, semantic, limit) {
  const found = new Map();
  for (const list of [keyword, semantic]) {
    list.forEach((item, rank) => {
      const existing = found.get(item.id);
      const value = existing || { ...item, rankScore: 0 };
      value.rankScore += 1 / (60 + rank + 1);
      if (item.semanticScore != null) value.semanticScore = item.semanticScore;
      if (item.vectorOffset != null) value.vectorOffset = item.vectorOffset;
      found.set(item.id, value);
    });
  }
  return [...found.values()].sort((a, b) => b.rankScore - a.rankScore).slice(0, limit);
}

export async function createBgeEmbedder(modelPath) {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.useFSCache = false;
  const extractor = await pipeline('feature-extraction', modelPath, {
    dtype: 'q8', device: 'cpu', local_files_only: true,
    session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 }
  });
  return {
    async embed(text, query = false) {
      const output = await extractor((query ? BGE_QUERY_PREFIX : '') + text, { pooling: 'cls', normalize: true });
      const vector = Float32Array.from(output.data);
      if (vector.length !== BGE_DIMENSIONS || !vector.every(Number.isFinite)) throw new Error('BGE 返回无效向量');
      return vector;
    },
    async close() { await extractor.dispose(); }
  };
}
