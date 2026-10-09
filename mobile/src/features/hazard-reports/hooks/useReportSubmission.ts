import { useRef, useState } from 'react';
import type { ReportDraft } from '../domain/types';
import { validateReportDraft, type DraftProblem } from '../domain/validateReportDraft';
import { answerDuplicate, type SubmitFlowDeps } from '../offline/submitReport';
import type { SubmitNowResult } from '../offline/SyncManager';
import type { UploadOptions } from '../offline/types';

export type SubmissionDeps = SubmitFlowDeps;
export type SubmissionOutcome = SubmitNowResult | { kind: 'STORAGE_ERROR' };
export function useReportSubmission(ownerId: string, deps: SubmissionDeps) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SubmissionOutcome>();
  const [problems, setProblems] = useState<DraftProblem[]>([]);
  const pending = useRef(false);
  const attempt = useRef<{ signature: string; clientReportId: string } | undefined>(undefined);
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
    pending.current = true;
    setBusy(true);
    setOutcome(undefined);
    setProblems([]);
    try {
      if (attempt.current?.signature !== signature) {
        attempt.current = undefined;
        const entry = await deps.queue.enqueue(ownerId, checked.value);
        attempt.current = { signature, clientReportId: entry.clientReportId };
      }
      const id = attempt.current.clientReportId;
      setOutcome(
        duplicateAction
          ? await answerDuplicate(deps, ownerId, id, duplicateAction)
          : await deps.sync.submitNow(id),
      );
    } catch {
      setOutcome(attempt.current ? { kind: 'SAVED_OFFLINE' } : { kind: 'STORAGE_ERROR' });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, outcome, problems, submit, reset };
}
