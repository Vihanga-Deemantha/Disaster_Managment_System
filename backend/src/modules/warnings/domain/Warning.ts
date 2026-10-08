import { LANGUAGES, type HazardType, type Language, type Severity } from '@shared/contracts/enums';
import { ConflictError, ForbiddenError, ValidationError } from '@shared/errors';
import type { TargetArea } from './TargetArea';
import { SMS_MAX_LENGTH, lengthOf, type Messages, type WarningStatus } from './types';
import { validationResult, type FieldIssue, type ValidationResult } from './ValidationResult';

export interface WarningProps {
  warningId: string;
  hazardType: HazardType;
  severity: Severity;
  messages: Messages;
  targetAreas: TargetArea[];
  validFrom: Date;
  validTo: Date;
  status: WarningStatus;
  submittedBy: string;
  submittedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  issuedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  /** The UC-3 cluster this draft came from, so a second escalation updates it instead of duplicating it. */
  sourceClusterId?: string;
  updatedAt: Date;
  /** Bumped by every change; the repository saves only against the version the caller loaded (A2). */
  version: number;
}

export type NewWarning = Pick<
  WarningProps,
  | 'warningId'
  | 'hazardType'
  | 'severity'
  | 'messages'
  | 'targetAreas'
  | 'validFrom'
  | 'validTo'
  | 'submittedBy'
  | 'sourceClusterId'
>;

/** What an officer may change while a warning waits for approval (A2). */
export interface WarningChanges {
  messages?: Partial<Messages>;
  severity?: Severity;
  validFrom?: Date;
  validTo?: Date;
}

function mergeMessages(current: Messages, patch: Partial<Messages> = {}): Messages {
  const next = { ...current };
  for (const language of LANGUAGES) {
    const text = patch[language];
    if (text !== undefined) next[language] = text;
  }
  return next;
}

/**
 * The warning aggregate (CD-01, CD-03). It owns its own state changes (SRP): delivery lives elsewhere.
 * Every change bumps `version`, so a stale editor is detected by the repository.
 */
export class Warning {
  private constructor(private readonly state: WarningProps) {}

  /** A draft entering Pending Approval, whether typed by a Duty Officer or proposed from a UC-3 cluster. */
  static create(input: NewWarning, now: Date): Warning {
    return new Warning({
      ...input,
      messages: { ...input.messages },
      targetAreas: [...input.targetAreas],
      status: 'PENDING_APPROVAL',
      submittedAt: now,
      updatedAt: now,
      version: 1,
    });
  }

  static restore(props: WarningProps): Warning {
    return new Warning({
      ...props,
      messages: { ...props.messages },
      targetAreas: [...props.targetAreas],
    });
  }

  get warningId(): string {
    return this.state.warningId;
  }

  get status(): WarningStatus {
    return this.state.status;
  }

  get version(): number {
    return this.state.version;
  }

  get hazardType(): HazardType {
    return this.state.hazardType;
  }

  get severity(): Severity {
    return this.state.severity;
  }

  get submittedBy(): string {
    return this.state.submittedBy;
  }

  get targetAreas(): readonly TargetArea[] {
    return this.state.targetAreas;
  }

  get sourceClusterId(): string | undefined {
    return this.state.sourceClusterId;
  }

  /** True once an officer has approved it, even if sending has not finished (the claim on issuing). */
  get isApproved(): boolean {
    return this.state.approvedAt !== undefined;
  }

  /** UC-1 step 6 and E1: pure, returns every problem at once so the screen can mark them all. */
  validate(now: Date): ValidationResult {
    return validationResult([
      ...this.statusIssues(),
      ...this.messageIssues(),
      ...this.areaIssues(),
      ...this.validityIssues(now),
    ]);
  }

  /** A2: change text, severity or validity while the warning waits. Saving an incomplete draft is allowed. */
  update(changes: WarningChanges, now: Date): void {
    this.assertEditable();
    this.state.messages = mergeMessages(this.state.messages, changes.messages);
    this.state.severity = changes.severity ?? this.state.severity;
    this.state.validFrom = changes.validFrom ?? this.state.validFrom;
    this.state.validTo = changes.validTo ?? this.state.validTo;
    this.touch(now);
  }

  /**
   * UC-1 step 7 (BR2): records who approved and when. The submitter may not approve their own warning.
   * The same officer may approve again to resume an interrupted issue: the original approval is kept,
   * but the version still moves on, so two parallel attempts cannot both win the claim.
   */
  approve(officerId: string, now: Date): void {
    this.assertPending();
    if (officerId === this.state.submittedBy) {
      throw new ForbiddenError(
        'SELF_APPROVAL_FORBIDDEN',
        'The officer who submitted a warning cannot approve it.',
      );
    }
    if (this.state.approvedBy !== undefined && this.state.approvedBy !== officerId) {
      throw new ConflictError(
        'WARNING_NOT_PENDING',
        'Another officer is already issuing this warning.',
      );
    }
    this.state.approvedBy = officerId;
    this.state.approvedAt = this.state.approvedAt ?? now;
    this.touch(now);
  }

  /** UC-1 step 13 (SD1-05): only after approval, and only once delivery attempts have been recorded. */
  markIssued(now: Date): void {
    this.assertPending();
    if (!this.isApproved) {
      throw new ConflictError(
        'WARNING_NOT_APPROVED',
        'A warning must be approved before it can be issued.',
      );
    }
    this.state.status = 'ISSUED';
    this.state.issuedAt = now;
    this.touch(now);
  }

  /** A3: a reason is mandatory, and a warning that is already being issued can no longer be rejected. */
  reject(officerId: string, reason: string, now: Date): void {
    this.assertEditable();
    const trimmed = reason.trim();
    if (trimmed === '') {
      throw new ValidationError([{ field: 'reason', code: 'REASON_REQUIRED' }]);
    }
    this.state.status = 'REJECTED';
    this.state.rejectedBy = officerId;
    this.state.rejectedAt = now;
    this.state.rejectionReason = trimmed;
    this.touch(now);
  }

  /**
   * BR5: a warning that was issued or rejected can never be issued again. The controller asks this
   * first, so "already done" (409) is reported before "not valid" (400).
   */
  assertPending(): void {
    if (this.state.status !== 'PENDING_APPROVAL') {
      throw new ConflictError(
        'WARNING_NOT_PENDING',
        'This warning is no longer waiting for approval.',
      );
    }
  }

  /** The text sent as SMS in this language (the report's 160-character rule is checked by `validate`). */
  smsText(language: Language): string {
    return this.state.messages[language].trim();
  }

  snapshot(): WarningProps {
    return {
      ...this.state,
      messages: { ...this.state.messages },
      targetAreas: [...this.state.targetAreas],
    };
  }

  private statusIssues(): FieldIssue[] {
    return this.state.status === 'PENDING_APPROVAL'
      ? []
      : [{ field: 'status', code: 'NOT_PENDING' }];
  }

  private messageIssues(): FieldIssue[] {
    return LANGUAGES.flatMap((language) => this.messageIssue(language));
  }

  private messageIssue(language: Language): FieldIssue[] {
    const field = `messages.${language}`;
    const text = this.smsText(language);
    if (text === '') return [{ field, code: 'MESSAGE_REQUIRED' }];
    return lengthOf(text) > SMS_MAX_LENGTH ? [{ field, code: 'SMS_TOO_LONG' }] : [];
  }

  private areaIssues(): FieldIssue[] {
    return this.state.targetAreas.length === 0
      ? [{ field: 'targetAreas', code: 'TARGET_AREA_REQUIRED' }]
      : [];
  }

  private validityIssues(now: Date): FieldIssue[] {
    const { validFrom, validTo } = this.state;
    if (validTo.getTime() <= validFrom.getTime()) {
      return [{ field: 'validTo', code: 'VALIDITY_WINDOW_INVALID' }];
    }
    return validTo.getTime() <= now.getTime()
      ? [{ field: 'validTo', code: 'VALIDITY_EXPIRED' }]
      : [];
  }

  private assertEditable(): void {
    this.assertPending();
    if (this.isApproved) {
      throw new ConflictError('WARNING_NOT_PENDING', 'This warning is already being issued.');
    }
  }

  private touch(now: Date): void {
    this.state.updatedAt = now;
    this.state.version += 1;
  }
}
