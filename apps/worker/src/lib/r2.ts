import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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
