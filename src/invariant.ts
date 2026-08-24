/**
 * Shared invariant helper (repo convention: every plugin ships one).
 * @module dsh-easy-upgrade/invariant
 */

/** Assert a condition, throwing with a message when it fails. */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[dsh-easy-upgrade] ${message}`)
}

/** Sentinel used where a null literal is intentional. */
export const NULL_PLACEHOLDER = null