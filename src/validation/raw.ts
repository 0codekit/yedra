import { BodyType } from './body';

class RawBody extends BodyType<Uint8Array> {
  public deserialize(buffer: Uint8Array, contentType: string) {
    return buffer;
  }
}

/**
 * Accepts a raw buffer of the specified content type.
 */
export const raw = (): RawBody => new RawBody();
