import type { Readable } from 'node:stream';
import { BodyType, type Typeof } from './body.js';
import { ValidationError } from './error.js';

class EitherBody<T extends [...BodyType<unknown>[]]> extends BodyType<
  Typeof<T[number]>
> {
  private options: T;

  public constructor(options: T) {
    super();
    this.options = options;
  }

  public deserialize(
    stream: Readable,
    contentType: string,
  ): Promise<Typeof<T[number]>> {
    const issues = [];
    for (const option of this.options) {
      try {
        return option.deserialize(stream, contentType);
      } catch (error) {
        if (error instanceof ValidationError) {
          issues.push(...error.issues);
        } else {
          throw error;
        }
      }
    }
    throw new ValidationError(issues);
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
 * A body that matches any of the provided options.
 * @param options
 * @returns
 */
export const either = <T extends [...BodyType<unknown>[]]>(...options: T) =>
  new EitherBody(options);
