import { BodyType } from './body';

export class NoneBody extends BodyType<void> {
  public deserialize(buffer: Uint8Array, contentType: string): void {
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
