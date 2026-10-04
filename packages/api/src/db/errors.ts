/** Whether `error` (or its cause, as Drizzle wraps driver errors) is a Postgres unique violation. */
export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  if ('code' in error && error.code === '23505') {
    return true
  }
  return isUniqueViolation(error.cause)
}
