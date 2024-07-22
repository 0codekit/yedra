import { BodyType } from './body.js';

export class NoneBody extends BodyType<undefined> {
  public deserialize(buffer: Uint8Array, contentType: string): undefined {
    return;
  }

  public bodyDocs(): object {
    // TODO
    return {};
  }
}

/**
 * Accepts no input body.
 */
export const none = (): NoneBody => new NoneBody();
