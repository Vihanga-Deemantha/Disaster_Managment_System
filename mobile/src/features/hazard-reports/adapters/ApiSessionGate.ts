import type { ApiClient } from '@/shared/api/apiClient';
import { isPublicRole, type Role } from '@/shared/contracts/enums';
import type { SessionGate } from '../offline/ports';

function readUser(body: unknown): { userId: string; role: Role } {
  const user = (body as { user?: { userId?: unknown; role?: unknown } } | null)?.user;
  if (!user || typeof user.userId !== 'string' || !user.userId || typeof user.role !== 'string')
    throw new Error('Could not verify the report session.');
  return { userId: user.userId, role: user.role as Role };
}

export class ApiSessionGate implements SessionGate {
  constructor(private readonly api: ApiClient) {}
  async currentUserId(): Promise<string | undefined> {
    const { status, body } = await this.api.send('GET', '/api/auth/me');
    if (status === 401) return undefined;
    if (status !== 200) throw new Error('Could not verify the report session.');
    const user = readUser(body);
    return isPublicRole(user.role) ? user.userId : undefined;
  }
}
