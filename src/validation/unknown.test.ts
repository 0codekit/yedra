import { expect, test } from "bun:test";
import { unknown } from "./unknown.js";

test("Validate Unknown", () => {
  const schema = unknown();
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({});
  expect(schema.parse(undefined)).toBeUndefined();
  expect(schema.parse({ hello: 3 })).toStrictEqual({ hello: 3 });
});
