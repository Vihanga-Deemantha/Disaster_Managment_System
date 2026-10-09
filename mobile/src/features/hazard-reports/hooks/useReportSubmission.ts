import { useRef, useState } from 'react';
import type { ReportDraft, ValidReportDraft } from '../domain/types';
import { validateReportDraft, type DraftProblem } from '../domain/validateReportDraft';
import type { Clock, IdGenerator, ReportUploader } from '../offline/ports';
import type { QueuedReport, UploadOptions, UploadOutcome } from '../offline/types';

export interface SubmissionDeps {
  clock: Clock;
  ids: IdGenerator;
  uploader: ReportUploader;
}
function capture(ownerId: string, draft: ValidReportDraft, deps: SubmissionDeps): QueuedReport {
  return {
    ...draft,
    ownerId,
    clientReportId: deps.ids.next(),
    capturedAt: deps.clock.now().toISOString(),
    state: 'QUEUED',
    attempts: 0,
  };
}
export function useReportSubmission(ownerId: string, deps: SubmissionDeps) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<UploadOutcome>();
  const [problems, setProblems] = useState<DraftProblem[]>([]);
  const pending = useRef(false);
  const attempt = useRef<
    | { signature: string; entry: QueuedReport; duplicateAction?: UploadOptions['duplicateAction'] }
    | undefined
  >(undefined);
  function reset(): void {
    attempt.current = undefined;
    setOutcome(undefined);
    setProblems([]);
  }
  async function submit(
    draft: ReportDraft,
    duplicateAction?: UploadOptions['duplicateAction'],
  ): Promise<void> {
    if (pending.current) return;
    const checked = validateReportDraft(draft);
    if (!checked.ok) {
      setProblems(checked.problems);
      return;
    }
    const signature = JSON.stringify([ownerId, checked.value]);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, entry: capture(ownerId, checked.value, deps) };
    if (duplicateAction) attempt.current.duplicateAction = duplicateAction;
    pending.current = true;
    setBusy(true);
    setOutcome(undefined);
    setProblems([]);
    try {
      setOutcome(
        await deps.uploader.upload(attempt.current.entry, {
          syncedFromOffline: false,
          duplicateAction: attempt.current.duplicateAction,
        }),
      );
    } catch {
      setOutcome({ kind: 'RETRY' });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, outcome, problems, submit, reset };
}
