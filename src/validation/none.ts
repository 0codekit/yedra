import type { Readable } from 'node:stream';
import { BodyType } from './body.js';

export class NoneBody extends BodyType<undefined, undefined> {
  public deserialize(
    _stream: Readable,
    _contentType: string,
  ): Promise<undefined> {
    return Promise.resolve(undefined);
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
