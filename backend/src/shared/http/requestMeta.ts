import type { Request } from 'express';

/** Who is calling, for audit entries. Never includes credentials. */
export interface RequestMeta {
  ip: string;
  userAgent: string;
}

const MAX_USER_AGENT_LENGTH = 200;

export function getRequestMeta(req: Request): RequestMeta {
  return {
    ip: req.ip ?? 'unknown',
    userAgent: (req.get('user-agent') ?? 'unknown').slice(0, MAX_USER_AGENT_LENGTH),
  };
}
