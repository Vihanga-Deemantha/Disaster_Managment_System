import type { AuthContext } from '@shared/auth/domain/types';
import type { AuditLog } from '@shared/audit/AuditLog';
import type { Clock } from '@shared/time/Clock';
import { ForbiddenError } from '@shared/errors/DomainError';
import type { FilterInput } from '../domain/types';

/** UCD-15 / A1 / E4: all three actors are primary; organisation scope is server-enforced. */
export class AccessScope {
  constructor(
    private readonly audit: AuditLog,
    private readonly clock: Clock,
  ) {}
  async withScope(input: FilterInput, user: AuthContext): Promise<FilterInput> {
    if (user.role === 'DMC_OFFICER') return { ...input };
    if (
      !user.organizationId ||
      (input.organizationId && input.organizationId !== user.organizationId)
    ) {
      await this.audit.record({
        action: 'analytics.scope.denied',
        actorId: user.userId,
        actorRole: user.role,
        occurredAt: this.clock.now(),
        reason: 'FORBIDDEN_SCOPE',
        details: { requestedOrganization: input.organizationId },
      });
      throw new ForbiddenError(
        'FORBIDDEN_SCOPE',
        'You may only view your own organisation’s relief data.',
      );
    }
    return { ...input, organizationId: user.organizationId };
  }
}
