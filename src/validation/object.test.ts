import { expect, test } from "bun:test";
import { number } from "./number.js";
import { laxObject, object } from "./object.js";
import { string } from "./string.js";

test("Validate Object", () => {
  const schema = object({
    num: number(),
    str: string().optional(),
  });
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    type: "object",
    properties: {
      num: {
        type: "number",
      },
      str: {
        type: "string",
      },
    },
    required: ["num"],
  });
  const result: {
    num: number;
    str?: string;
  } = schema.parse({ num: 3 });
  expect(result).toStrictEqual({ num: 3, str: undefined });
  expect(schema.parse({ num: 3, str: "hello" })).toStrictEqual({
    num: 3,
    str: "hello",
  });
  expect(() => schema.parse({ num: 3, str: "hello", x: "world" })).toThrow(
    "Error at `x`: Unrecognized.",
  );
});

test("Validate Lax Object", () => {
  const schema = laxObject({
    num: number(),
    str: string().optional(),
  });
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    type: "object",
    properties: {
      num: {
        type: "number",
      },
      str: {
        type: "string",
      },
    },
    required: ["num"],
    additionalProperties: true,
  });
  const result: {
    num: number;
    str?: string;
  } = schema.parse({ num: 3 });
  expect(result).toStrictEqual({ num: 3, str: undefined });
  expect(schema.parse({ num: 3, str: "hello" })).toStrictEqual({
    num: 3,
    str: "hello",
  });
  expect(schema.parse({ num: 3, str: "hello", x: "world" })).toStrictEqual({
    num: 3,
    str: "hello",
  });
});
