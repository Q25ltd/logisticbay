/** Narrow an unknown catch value to a user-showable message. */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
