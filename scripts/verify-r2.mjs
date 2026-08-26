// Verifica o R2: bucket existe (cria se não), escrita/leitura/deleção e domínio público.
// Lê as credenciais do .env na raiz.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (await readFile(join(root, '.env'), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const bucket = env.R2_BUCKET || 'easymidia-clips';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

try {
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`bucket ${bucket}: existe`);
} catch (err) {
  if (err.$metadata?.httpStatusCode === 404) {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`bucket ${bucket}: criado agora`);
  } else {
    console.error(`bucket ${bucket}: erro ${err.$metadata?.httpStatusCode ?? ''} ${err.name}`);
    process.exit(1);
  }
}

const key = '_healthcheck.txt';
await s3.send(
  new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'ok', ContentType: 'text/plain' })
);
console.log('escrita: ok');

if (env.R2_PUBLIC_URL) {
  const url = `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    console.log(`domínio público (${url}): ${res.ok ? 'OK' : `HTTP ${res.status}`}`);
  } catch {
    console.log(`domínio público (${url}): ainda não responde (DNS/custom domain pendente)`);
  }
}

await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
console.log('limpeza: ok');
