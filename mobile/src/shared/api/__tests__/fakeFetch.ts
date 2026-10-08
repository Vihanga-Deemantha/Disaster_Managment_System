/** A scripted `fetch` for tests: records every call and answers with whatever the script says. */
export type Reply =
  { status: number; json?: unknown; notJson?: true } | { throws: Error } | { hangs: true };

export interface RecordedCall {
  url: string;
  init: RequestInit;
}

export type Script = (call: RecordedCall, callNumber: number) => Reply;

export function scriptedFetch(script: Script) {
  const calls: RecordedCall[] = [];

  const impl = async (url: string, init: RequestInit): Promise<Response> => {
    const call = { url, init };
    calls.push(call);
    const reply = script(call, calls.length);
    if ('throws' in reply) throw reply.throws;
    if ('hangs' in reply) {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    return {
      status: reply.status,
      json: async () => {
        if (reply.notJson || !('json' in reply)) throw new SyntaxError('not json');
        return reply.json;
      },
    } as unknown as Response;
  };

  return { fetchImpl: impl as unknown as typeof fetch, calls };
}

/** The error body the API sends. */
export const errorBody = (code: string, message = code, extra: object = {}) => ({
  error: { code, message, ...extra },
});

/** Replies from a fixed list, in order; once it runs out every call answers `200 {}`. */
export const inOrder =
  (...replies: Reply[]): Script =>
  (_call, callNumber) =>
    replies[callNumber - 1] ?? { status: 200, json: {} };
