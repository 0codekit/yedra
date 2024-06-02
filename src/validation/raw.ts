import { BodyType } from './body';
import { Issue, ValidationError } from './error';

class RawBody extends BodyType<Uint8Array> {
  private contentType: string;

  public constructor(contentType: string) {
    super();
    this.contentType = contentType;
  }

  public deserialize(buffer: Uint8Array, contentType: string) {
    if (contentType !== this.contentType) {
      throw new ValidationError([
        new Issue('invalidContentType', [], this.contentType, contentType),
      ]);
    }
    return buffer;
  }
}

/**
 * Accepts a raw buffer of the specified content type.
 * @param contentType
 * @returns
 */
export const raw = (contentType: string): RawBody => new RawBody(contentType);
