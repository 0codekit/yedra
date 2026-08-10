/**
 * Reduce a `Content-Type` header to its bare media type, lowercased.
 *
 * A header carries parameters — `application/json; charset=utf-8` is what a
 * good many clients send — and the type itself is case-insensitive, so a body
 * type that compares the header verbatim rejects requests it was meant to
 * accept. Everything that dispatches on a content type goes through here.
 * @param contentType - The raw header value.
 */
export const mediaType = (contentType: string): string =>
  contentType.split(';')[0]?.trim().toLowerCase() ?? '';
