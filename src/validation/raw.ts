import { BodyType } from './body';

class RawBody extends BodyType<Uint8Array> {
  public deserialize(buffer: Uint8Array) {
    return buffer;
  }
}

export const raw = (): RawBody => new RawBody();
