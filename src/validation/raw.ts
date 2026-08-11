import type { Readable } from 'node:stream';
import { readableToBuffer } from '../util/stream.js';
import { binaryDocs } from './binary.js';
import { BodyType } from './body.js';
import { mediaType } from './content-type.js';

const ANY_CONTENT_TYPE = 'application/octet-stream';

class RawBody extends BodyType<Buffer<ArrayBuffer>, Buffer<ArrayBufferLike>> {
  private readonly contentType: string;

  public constructor(contentType: string) {
    super();
    this.contentType = mediaType(contentType);
  }

  public async deserialize(
    stream: Readable,
    _contentType: string,
  ): Promise<Buffer<ArrayBuffer>> {
    return await readableToBuffer(stream);
  }

  public override accepts(contentType: string): boolean {
    // Only relevant inside `y.either`. A raw body declared without a content
    // type is a catch-all, so it keeps matching anything.
    return (
      this.contentType === ANY_CONTENT_TYPE ||
      mediaType(contentType) === this.contentType
    );
  }

  public bodyDocs(): object {
    return {
      [this.contentType]: { schema: binaryDocs(this.contentType) },
    };
  }
}

/**
 * Accepts a raw buffer of the specified content type.
 */
export const raw = (contentType?: string): RawBody =>
  new RawBody(contentType ?? ANY_CONTENT_TYPE);
