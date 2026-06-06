/**
 * shiftValidation.ts — business rules for shift segment checks.
 *
 * TASK 5.4: extracted from api/src/validation.ts which is being deleted.
 * validateSegmentChecks has dynamic business logic (allowedKeys from
 * constants) that cannot be expressed as a static Zod schema.
 */

export interface CheckItem {
  key:     string;
  result?: string;
  ok?:     boolean;
  note?:   string;
}

/**
 * Validate that every check item in an array:
 *   1. Uses a key from the allowed set.
 *   2. Has a note when the check failed (result='fail' or ok=false).
 */
export function validateSegmentChecks(
  checks:      CheckItem[],
  allowedKeys: string[],
  name:        string,
): string[] {
  const errors: string[] = [];
  if (!Array.isArray(checks)) {
    errors.push(`${name} must be an array`);
    return errors;
  }
  checks.forEach((c, i) => {
    if (!allowedKeys.includes(c.key)) {
      errors.push(`${name}[${i}]: unknown key "${c.key}"`);
    }
    const isFail = c.result === "fail" || c.ok === false;
    if (isFail && !c.note?.trim()) {
      errors.push(`${name}[${i}]: note required when check fails (${c.key})`);
    }
  });
  return errors;
}
