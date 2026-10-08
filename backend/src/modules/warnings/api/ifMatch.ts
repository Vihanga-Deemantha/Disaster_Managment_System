/**
 * The version in an `If-Match` header: `3`, `"3"` or `W/"3"`. Anything else is ignored, so the body's
 * `expectedVersion` (or the 400 asking for one) takes over.
 */
export function parseIfMatch(header: string | undefined): number | undefined {
  const match = header === undefined ? null : /^(?:W\/)?"?(\d+)"?$/.exec(header.trim());
  return match ? Number(match[1]) : undefined;
}
