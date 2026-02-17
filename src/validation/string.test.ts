import { expect, test } from "bun:test";
import { string } from "./string.js";

test("Validate String", () => {
  const schema = string();
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    type: "string",
  });
  expect(schema.parse("hello")).toStrictEqual("hello");
  expect(() => schema.parse(3)).toThrow(
    "Error at ``: Expected string but got number.",
  );
});

test("Validate String Pattern", () => {
  const schema = string().pattern(/^[0-9]+$/);
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    type: "string",
    pattern: "^[0-9]+$",
  });
  expect(schema.parse("123")).toStrictEqual("123");
  expect(() => schema.parse("hello")).toThrow(
    "Error at ``: Does not match pattern /^[0-9]+$/.",
  );
  expect(() => schema.parse(3)).toThrow(
    "Error at ``: Expected string but got number.",
  );
});

test("Validate String Min", () => {
  const schema = string().min(2);
  expect(schema.documentation()).toStrictEqual({
    type: "string",
    minLength: 2,
  });
  expect(schema.parse("ab")).toStrictEqual("ab");
  expect(() => schema.parse("a")).toThrow(
    "Error at ``: Must be at least 2 characters.",
  );
});

test("Validate String Email", () => {
  const schema = string().email();
  expect(schema.isOptional()).toBeFalse();
  expect(schema.documentation()).toStrictEqual({
    type: "string",
    format: "email",
  });
  expect(schema.parse("user@example.com")).toStrictEqual("user@example.com");
  expect(() => schema.parse("not-email")).toThrow(
    "Error at ``: Expected email address.",
  );
  expect(() => schema.parse(3)).toThrow(
    "Error at ``: Expected string but got number.",
  );
});

test("Validate String Email Optional", () => {
  const schema = string().email().optional();
  expect(schema.isOptional()).toBeTrue();
  expect(schema.parse("user@example.com")).toStrictEqual("user@example.com");
  expect(schema.parse(undefined)).toBeUndefined();
});

test("Validate String Email With Max", () => {
  const schema = string()
    .max(254)
    .refine(
      (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || "Expected email address",
      { format: "email" },
    );
  expect(schema.documentation()).toStrictEqual({
    type: "string",
    maxLength: 254,
    format: "email",
  });
  expect(schema.parse("user@example.com")).toStrictEqual("user@example.com");
});

test("Validate String Max", () => {
  const schema = string().max(5);
  expect(schema.documentation()).toStrictEqual({
    type: "string",
    maxLength: 5,
  });
  expect(schema.parse("abcde")).toStrictEqual("abcde");
  expect(() => schema.parse("abcdef")).toThrow(
    "Error at ``: Must be at most 5 characters.",
  );
});

test("Validate String Min And Max", () => {
  const schema = string().min(2).max(5);
  expect(schema.documentation()).toStrictEqual({
    type: "string",
    minLength: 2,
    maxLength: 5,
  });
  expect(schema.parse("ab")).toStrictEqual("ab");
  expect(schema.parse("abcde")).toStrictEqual("abcde");
  expect(() => schema.parse("a")).toThrow(
    "Error at ``: Must be at least 2 characters.",
  );
  expect(() => schema.parse("abcdef")).toThrow(
    "Error at ``: Must be at most 5 characters.",
  );
});

test("Validate String Min With Pattern", () => {
  const schema = string()
    .min(2)
    .refine((s) => /^[a-z]+$/.test(s) || "Does not match pattern /^[a-z]+$/", {
      pattern: "^[a-z]+$",
    });
  expect(schema.documentation()).toStrictEqual({
    type: "string",
    minLength: 2,
    pattern: "^[a-z]+$",
  });
  expect(schema.parse("ab")).toStrictEqual("ab");
  expect(() => schema.parse("a")).toThrow(
    "Error at ``: Must be at least 2 characters.",
  );
  expect(() => schema.parse("AB")).toThrow(
    "Error at ``: Does not match pattern /^[a-z]+$/.",
  );
});

test("Validate String Pattern Then Refine Min", () => {
  const schema = string()
    .pattern(/^[a-z]+$/)
    .refine((s) => s.length >= 2 || "Must be at least 2 characters", {
      minLength: 2,
    });
  expect(schema.documentation()).toStrictEqual({
    type: "string",
    pattern: "^[a-z]+$",
    minLength: 2,
  });
  expect(schema.parse("ab")).toStrictEqual("ab");
  expect(() => schema.parse("a")).toThrow(
    "Error at ``: Must be at least 2 characters.",
  );
});
