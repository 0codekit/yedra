import type { Readable } from 'node:stream';
import { BodyType } from './body.js';

class StreamBody extends BodyType<ReadableStream> {
  private readonly contentType: string;

  public constructor(contentType: string) {
    super();
    this.contentType = contentType;
  }

  public deserialize(
    stream: Readable,
    _contentType: string,
  ): Promise<ReadableStream> {
    return Promise.resolve(
      new ReadableStream({
        async start(controller) {
          for await (const chunk of stream) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      }),
    );
  }

  public bodyDocs(): object {
    return {
      [this.contentType]: {},
    };
  }
}

/**
 * Accepts a raw buffer of the specified content type, and presents it as a stream.
 */
export const stream = (contentType?: string): StreamBody =>
  new StreamBody(contentType ?? 'application/octet-stream');
