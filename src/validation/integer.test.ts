import { expect, test } from "bun:test";
import { integer } from "./integer.js";

test("Validate Integer", () => {
  const schema = integer();
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    type: "integer",
  });
  expect(schema.parse(100)).toStrictEqual(100);
  expect(schema.parse("100")).toStrictEqual(100);
  expect(() => schema.parse("hello")).toThrow(
    "Error at ``: Expected integer but got string.",
  );
  expect(() => schema.parse("1.3")).toThrow(
    "Error at ``: Expected integer but got string.",
  );
  expect(() => schema.parse(5.3)).toThrow(
    "Error at ``: Expected integer but got number.",
  );
});

test("Validate Integer Min", () => {
  const schema = integer().min(10);
  expect(schema.documentation()).toStrictEqual({
    type: "integer",
    minimum: 10,
  });
  expect(schema.parse(10)).toStrictEqual(10);
  expect(() => schema.parse(9)).toThrow(
    "Error at ``: Must be at least 10, but was 9.",
  );
});

test("Validate Integer Max", () => {
  const schema = integer().max(100);
  expect(schema.documentation()).toStrictEqual({
    type: "integer",
    maximum: 100,
  });
  expect(schema.parse(100)).toStrictEqual(100);
  expect(() => schema.parse(101)).toThrow(
    "Error at ``: Must be at most 100, but was 101.",
  );
});

test("Validate Integer Min Custom Message", () => {
  const schema = integer().min(10, "Too small");
  expect(schema.parse(10)).toStrictEqual(10);
  expect(() => schema.parse(9)).toThrow("Error at ``: Too small.");
});

test("Validate Integer Max Custom Message", () => {
  const schema = integer().max(100, "Too large");
  expect(schema.parse(100)).toStrictEqual(100);
  expect(() => schema.parse(101)).toThrow("Error at ``: Too large.");
});
