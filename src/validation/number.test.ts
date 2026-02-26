import { expect, test } from "bun:test";
import { number } from "./number.js";

test("Validate Number", () => {
  const schema = number();
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    type: "number",
  });
  expect(schema.parse(100)).toStrictEqual(100);
  expect(schema.parse("100")).toStrictEqual(100);
  expect(() => schema.parse("hello")).toThrow(
    "Error at ``: Expected number but got string.",
  );
});

test("Validate Number Min", () => {
  const schema = number().min(10);
  expect(schema.documentation()).toStrictEqual({
    type: "number",
    minimum: 10,
  });
  expect(schema.parse(10)).toStrictEqual(10);
  expect(() => schema.parse(9)).toThrow(
    "Error at ``: Must be at least 10, but was 9.",
  );
});

test("Validate Number Max", () => {
  const schema = number().max(100);
  expect(schema.documentation()).toStrictEqual({
    type: "number",
    maximum: 100,
  });
  expect(schema.parse(100)).toStrictEqual(100);
  expect(() => schema.parse(101)).toThrow(
    "Error at ``: Must be at most 100, but was 101.",
  );
});

test("Validate Number Min Custom Message", () => {
  const schema = number().min(10, "Too small");
  expect(schema.parse(10)).toStrictEqual(10);
  expect(() => schema.parse(9)).toThrow("Error at ``: Too small.");
});

test("Validate Number Max Custom Message", () => {
  const schema = number().max(100, "Too large");
  expect(schema.parse(100)).toStrictEqual(100);
  expect(() => schema.parse(101)).toThrow("Error at ``: Too large.");
});
