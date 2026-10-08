/** Drops `undefined` fields: Mongo would otherwise store them as null. */
export const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
