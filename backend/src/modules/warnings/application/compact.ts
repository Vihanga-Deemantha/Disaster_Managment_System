/**
 * The same object without its `undefined` fields. MongoDB would store them as `null` and JSON would
 * either drop them or not, depending on the library, so both edges leave them out explicitly.
 */
export function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
