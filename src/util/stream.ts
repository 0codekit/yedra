import type { Readable } from 'node:stream';

export const readableToBuffer = async (
  stream: Readable,
): Promise<Buffer<ArrayBuffer>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};
