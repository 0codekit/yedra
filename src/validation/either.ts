import type { Readable } from 'node:stream';
import { BodyType, type TypeofAccepts, type TypeofProvides } from './body.js';
import { mediaType } from './content-type.js';
import { Issue, ValidationError } from './error.js';

class EitherBody<T extends [...BodyType<unknown, unknown>[]]> extends BodyType<
  TypeofProvides<T[number]>,
  TypeofAccepts<T[number]>
> {
  private readonly options: T;

  public constructor(options: T) {
    super();
    this.options = options;
  }

  public deserialize(
    stream: Readable,
    contentType: string,
  ): Promise<TypeofProvides<T[number]>> {
    // The option has to be chosen from the content type alone: a request body
    // is a stream that can only be read once, so falling back to a second
    // option after the first has already consumed it is not possible.
    const option = this.options.find((candidate) =>
      candidate.accepts(contentType),
    );
    if (option === undefined) {
      return Promise.reject(
        new ValidationError([
          new Issue(
            [],
            `Unsupported content type \`${mediaType(contentType)}\``,
          ),
        ]),
      );
    }
    return option.deserialize(stream, contentType) as Promise<
      TypeofProvides<T[number]>
    >;
  }

  public override accepts(contentType: string): boolean {
    return this.options.some((option) => option.accepts(contentType));
  }

  public bodyDocs(): object {
    let docs: object = {};
    for (const option of this.options) {
      docs = { ...docs, ...option.bodyDocs() };
    }
    return docs;
  }
}

/**
 * A body that accepts several content types, choosing the option that matches
 * the request's `Content-Type` header. The first matching option wins, so
 * catch-all options — `y.raw()` and `y.stream()` without an explicit content
 * type — should be listed last.
 *
 * ```typescript
 * y.either(y.object({ name: y.string() }), y.raw('application/pdf'))
 * ```
 *
 * To accept several different shapes of the *same* content type, use
 * `y.union` instead.
 * @param options - The bodies to choose between.
 */
export const either = <T extends [...BodyType<unknown, unknown>[]]>(
  ...options: T
) => new EitherBody(options);
