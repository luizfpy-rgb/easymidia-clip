import { S3Client, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { env } from '../env.js';

function client() {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 não configurado — preencha R2_* no .env (etapa 3 do setup)');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export async function uploadToR2(key: string, body: Buffer | string, contentType: string): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  if (!env.R2_PUBLIC_URL) throw new Error('R2_PUBLIC_URL não configurada');
  return `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
}

export async function deleteFromR2(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await client().send(
    new DeleteObjectsCommand({
      Bucket: env.R2_BUCKET,
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    })
  );
}

// URL pública → key do bucket (null se a URL não for do nosso R2)
export function keyFromPublicUrl(url: string): string | null {
  if (!env.R2_PUBLIC_URL) return null;
  const base = env.R2_PUBLIC_URL.replace(/\/$/, '');
  return url.startsWith(`${base}/`) ? url.slice(base.length + 1) : null;
}
