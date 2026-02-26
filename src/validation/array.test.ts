import { expect, test } from "bun:test";
import { number } from "./number.js";
import { string } from "./string.js";

test("Validate Array", () => {
  const schema = number().array();
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    type: "array",
    items: {
      type: "number",
    },
  });
  expect(schema.parse([3, 4, 5])).toStrictEqual([3, 4, 5]);
  expect(() => schema.parse(7)).toThrow(
    "Error at ``: Expected array but got number.",
  );
  expect(() => schema.parse(["hello", "world"])).toThrow(
    "Error at `0`: Expected number but got string. Error at `1`: Expected number but got string.",
  );
});

test("Validate Array Min And Max", () => {
  const schema = string().array().min(1).max(3);
  expect(schema.documentation()).toStrictEqual({
    type: "array",
    items: {
      type: "string",
    },
    minItems: 1,
    maxItems: 3,
  });
  expect(schema.parse(["hello"])).toStrictEqual(["hello"]);
  expect(schema.parse(["hello", "there", "world"])).toStrictEqual([
    "hello",
    "there",
    "world",
  ]);
  expect(() => schema.parse([])).toThrow(
    "Error at ``: Must have at least 1 items.",
  );
  expect(() => schema.parse(["a", "b", "c", "d"])).toThrow(
    "Error at ``: Must have at most 3 items.",
  );
});

test("Validate Array Length", () => {
  const schema = string().array().length(3);
  expect(schema.documentation()).toStrictEqual({
    type: "array",
    items: {
      type: "string",
    },
    maxItems: 3,
    minItems: 3,
  });
  expect(schema.parse(["hello", "there", "world"])).toStrictEqual([
    "hello",
    "there",
    "world",
  ]);
  expect(() => schema.parse(["hello", "world"])).toThrow(
    "Error at ``: Must have at least 3 items.",
  );
  expect(() => schema.parse(["hello", "there", "other", "world"])).toThrow(
    "Error at ``: Must have at most 3 items.",
  );
});

test("Validate Array Min Custom Message", () => {
  const schema = string().array().min(1, "Need at least one");
  expect(schema.parse(["hello"])).toStrictEqual(["hello"]);
  expect(() => schema.parse([])).toThrow("Error at ``: Need at least one.");
});

test("Validate Array Max Custom Message", () => {
  const schema = string().array().max(2, "Too many items");
  expect(schema.parse(["a", "b"])).toStrictEqual(["a", "b"]);
  expect(() => schema.parse(["a", "b", "c"])).toThrow(
    "Error at ``: Too many items.",
  );
});

test("Validate Array Length Custom Message", () => {
  const schema = string().array().length(2, "Must be exactly two");
  expect(schema.parse(["a", "b"])).toStrictEqual(["a", "b"]);
  expect(() => schema.parse(["a"])).toThrow(
    "Error at ``: Must be exactly two.",
  );
  expect(() => schema.parse(["a", "b", "c"])).toThrow(
    "Error at ``: Must be exactly two.",
  );
});
