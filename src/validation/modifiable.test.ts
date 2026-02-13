import { expect, test } from "bun:test";
import { number } from "./number.js";
import { laxObject } from "./object.js";
import { string } from "./string.js";

test("Validate Optional", () => {
  const schema = number().optional().describe("Optional", 3);
  expect(schema.documentation()).toStrictEqual({
    description: "Optional",
    example: 3,
    type: "number",
  });
  expect(schema.isOptional()).toBeTrue();
  expect(schema.parse(3)).toStrictEqual(3);
  expect(schema.parse(undefined)).toBeUndefined();
  expect(() => schema.parse("hello")).toThrow(
    "Error at ``: Expected number but got string.",
  );
});

test("Validate Default Undefined", () => {
  const schema = number().default(0);
  expect(schema.isOptional()).toBeTrue();
  expect(schema.parse(undefined)).toStrictEqual(0);
});

test("Validate Default Null", () => {
  const schema = number().default(0);
  expect(schema.parse(null)).toStrictEqual(0);
});

test("Validate Default Valid Value", () => {
  const schema = number().default(0);
  expect(schema.parse(42)).toStrictEqual(42);
});

test("Validate Default Invalid Value", () => {
  const schema = number().default(0);
  expect(() => schema.parse("not-a-number")).toThrow(
    "Error at ``: Expected number but got string.",
  );
});

test("Validate Default In Object", () => {
  const schema = laxObject({
    page: number().default(1),
  });
  expect(schema.parse({})).toStrictEqual({ page: 1 });
  expect(schema.parse({ page: 3 })).toStrictEqual({ page: 3 });
});

test("Validate Default Documentation", () => {
  const schema = number().default(0);
  expect(schema.documentation()).toStrictEqual({
    type: "number",
    default: 0,
  });
});

test("Validate Refine Pass", () => {
  const schema = string().refine((s) => s.length > 0 || "Required");
  expect(schema.parse("a")).toStrictEqual("a");
});

test("Validate Refine Fail", () => {
  const schema = string().refine((s) => s.length > 0 || "Required");
  expect(() => schema.parse("")).toThrow("Error at ``: Required.");
});

test("Validate Refine Default Message", () => {
  const schema = number().refine((n) => n > 0);
  expect(() => schema.parse(0)).toThrow("Error at ``: Validation failed.");
});

test("Validate Refine With Min", () => {
  const schema = number()
    .min(0)
    .refine((n) => n % 2 === 0 || "Must be even");
  expect(schema.parse(4)).toStrictEqual(4);
  expect(() => schema.parse(3)).toThrow("Error at ``: Must be even.");
  expect(() => schema.parse(-1)).toThrow(
    "Error at ``: Must be at least 0, but was -1.",
  );
});

test("Validate Refine Chaining Optional", () => {
  const schema = string()
    .refine((s) => s.length > 0 || "Required")
    .optional();
  expect(schema.isOptional()).toBeTrue();
  expect(schema.parse(undefined)).toBeUndefined();
  expect(schema.parse("a")).toStrictEqual("a");
  expect(() => schema.parse("")).toThrow("Error at ``: Required.");
});

test("Validate Refine Double", () => {
  const schema = number()
    .refine((n) => n > 0 || "Must be positive")
    .refine((n) => n < 100 || "Must be less than 100");
  expect(schema.parse(50)).toStrictEqual(50);
  expect(() => schema.parse(0)).toThrow("Error at ``: Must be positive.");
  expect(() => schema.parse(100)).toThrow(
    "Error at ``: Must be less than 100.",
  );
});
