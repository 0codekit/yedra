import { Readable } from 'node:stream';
import { BodyType } from './body.js';
import { mediaType } from './content-type.js';

const ANY_CONTENT_TYPE = 'application/octet-stream';

class StreamBody extends BodyType<ReadableStream, ReadableStream> {
  private readonly contentType: string;

  public constructor(contentType: string) {
    super();
    this.contentType = mediaType(contentType);
  }

  public deserialize(
    source: Readable,
    _contentType: string,
  ): Promise<ReadableStream> {
    // `Readable.toWeb` bridges the two stream types with backpressure intact.
    // Enqueuing from a loop inside `start` instead — which is what this used to
    // do — never consults `desiredSize`, so a consumer slower than the client
    // uploads makes the queue grow without bound: the point of streaming the
    // body rather than buffering it is lost.
    return Promise.resolve(Readable.toWeb(source) as ReadableStream);
  }

  public override accepts(contentType: string): boolean {
    // Only relevant inside `y.either`. A stream declared without a content
    // type is a catch-all, so it keeps matching anything.
    return (
      this.contentType === ANY_CONTENT_TYPE ||
      mediaType(contentType) === this.contentType
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
  new StreamBody(contentType ?? ANY_CONTENT_TYPE);
