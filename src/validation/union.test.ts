import { expect, test } from "bun:test";
import { number } from "./number.js";
import { string } from "./string.js";
import { union } from "./union.js";

test("Validate Union", () => {
  const schema = union(string(), number());
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    anyOf: [
      {
        type: "string",
      },
      {
        type: "number",
      },
    ],
  });
  expect(schema.parse(3)).toStrictEqual(3);
  expect(schema.parse("hello")).toStrictEqual("hello");
  expect(() => schema.parse({})).toThrow(
    "Error at ``: Expected string but got object. Error at ``: Expected number but got object.",
  );
});
