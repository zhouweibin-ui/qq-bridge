// Explicit model download only; the bridge itself never downloads weights.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const manifest = {
  "model": "BAAI/bge-small-zh-v1.5",
  "onnxRepository": "Xenova/bge-small-zh-v1.5",
  "revision": "75c43b069aac4d136ba6bc1122f995fedcfd2781",
  "dtype": "q8",
  "pooling": "cls",
  "files": [
    {
      "file": "config.json",
      "bytes": 716,
      "sha256": "d4193ead3a810fd694fa8a31d7fc72fbaebc0668b603e398734bf2f6538ff42f"
    },
    {
      "file": "tokenizer.json",
      "bytes": 439125,
      "sha256": "48cea5d44424912a6fd1ea647bf4fe50b55ab8b1e5879c3275f80e339e8fae26"
    },
    {
      "file": "tokenizer_config.json",
      "bytes": 367,
      "sha256": "e6f3b96db926a37d4039995fbf5ad17de158dfb8f6343d607e4dbaad18d75f5a"
    },
    {
      "file": "special_tokens_map.json",
      "bytes": 125,
      "sha256": "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3"
    },
    {
      "file": "onnx/model_quantized.onnx",
      "bytes": 24010842,
      "sha256": "15b717c382bcb518ba457b93ea6850ede7f4f1cd8937454aa06972366cd19bcc"
    }
  ]
};
const root = fileURLToPath(new URL('../state/models/bge-small-zh-v1.5/', import.meta.url));
for (const item of manifest.files) {
  const file = path.join(root, item.file);
  let bytes;
  try { bytes = await fs.readFile(file); } catch {}
  const valid = b => b?.length === item.bytes && crypto.createHash('sha256').update(b).digest('hex') === item.sha256;
  if (!valid(bytes)) {
    const response = await fetch(`https://huggingface.co/${manifest.onnxRepository}/resolve/${manifest.revision}/${item.file}`, {signal: AbortSignal.timeout(120000)});
    if (!response.ok) throw Error(`下载 ${item.file} 失败：HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (!valid(bytes)) throw Error(`${item.file} 大小或 SHA256 校验失败`);
    await fs.mkdir(path.dirname(file), {recursive: true, mode: 0o700});
    await fs.writeFile(file, bytes, {mode: 0o600});
  }
  console.log(`已校验 ${item.file}`);
}
await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {mode: 0o600});
