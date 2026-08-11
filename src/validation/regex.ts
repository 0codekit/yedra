/**
 * Copy a regular expression without the flags that make `test` stateful.
 *
 * `RegExp.prototype.test` advances `lastIndex` when the pattern is global or
 * sticky, and resumes from there on the next call — so a pattern reused across
 * values matches every other one. Every flag that only changes what the pattern
 * *means* (`i`, `m`, `s`, `u`, `v`) is kept.
 * @param pattern - The caller's regular expression.
 */
export const statelessCopy = (pattern: RegExp): RegExp =>
  pattern.global || pattern.sticky
    ? new RegExp(pattern.source, pattern.flags.replaceAll(/[gy]/g, ''))
    : pattern;
