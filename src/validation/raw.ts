import { BodyType } from './body.js';

class RawBody extends BodyType<Uint8Array> {
  private contentType: string;

  public constructor(contentType: string | undefined) {
    super();
    this.contentType = contentType ?? 'application/octet-stream';
  }

  public deserialize(buffer: Uint8Array, contentType: string) {
    return buffer;
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
export const raw = (contentType?: string): RawBody => new RawBody(contentType);
