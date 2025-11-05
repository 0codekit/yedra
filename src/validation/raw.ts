import type { Readable } from 'node:stream';
import { readableToBuffer } from '../util/stream.js';
import { BodyType } from './body.js';

class RawBody extends BodyType<Buffer<ArrayBuffer>, Buffer<ArrayBufferLike>> {
  private contentType: string;

  public constructor(contentType: string) {
    super();
    this.contentType = contentType;
  }

  public async deserialize(
    stream: Readable,
    _contentType: string,
  ): Promise<{ parsed: Buffer<ArrayBuffer>; raw: Buffer<ArrayBuffer> }> {
    const buffer = await readableToBuffer(stream);
    return {
      parsed: buffer,
      raw: buffer,
    };
  }

  public bodyDocs(): object {
    return {
      [this.contentType]: {},
    };
  }
}

/**
 * Accepts a raw buffer of the specified content type.
 */
export const raw = (contentType?: string): RawBody =>
  new RawBody(contentType ?? 'application/octet-stream');
