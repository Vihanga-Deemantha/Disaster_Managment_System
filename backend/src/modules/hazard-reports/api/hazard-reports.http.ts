import { getAuth } from '@shared/auth';
import { NotFoundError } from '@shared/errors/DomainError';
import { parseOrThrow } from '@shared/errors/zod';
import type { ModuleContext } from '@shared/module';
import { Router, type Request, type RequestHandler } from 'express';
import type { ReportSearch } from '../application/ports';
import type { ReportReviewService, ReviewOfficer } from '../application/ReportReviewService';
import type {
  ReportSubmissionService,
  SubmitReportCommand,
} from '../application/ReportSubmissionService';
import type { ReportStatus } from '../domain/types';
import { toClusterDetailDto, toClusterSummaryDto, toReportDto } from './dto';
import { uploadedPhotoOf } from './photoUpload';
import { historyQuerySchema, queueQuerySchema, rejectSchema, submitReportSchema } from './schemas';

export interface HazardReportsApi {
  submission: ReportSubmissionService;
  review: ReportReviewService;
  /** Reads the optional `photo` part of a multipart submission. */
  upload: RequestHandler;
  /** Absolute path of a stored photo, or undefined when the name is not one we stored. */
  resolvePhoto(fileName: string): string | undefined;
}

const PHOTO_NOT_FOUND = (): NotFoundError =>
  new NotFoundError('PHOTO_NOT_FOUND', 'This photo does not exist.');

/** Express types a route parameter as `string | string[]`; a named parameter is always one string. */
const param = (value: string | string[]): string => String(value);

/** The query string calls it `q`; the repository port calls it `text`. */
const toSearch = ({ status, q }: { status?: ReportStatus; q?: string }): ReportSearch => ({
  status,
  text: q,
});

const isOfficer = (role: string): boolean => role === 'DUTY_OFFICER' || role === 'DMC_OFFICER';

/** Role is validated by officersOnly before any review handler executes. */
function reviewOfficer(req: Request): ReviewOfficer {
  const { userId, role } = getAuth(req);
  return { userId, role: role as ReviewOfficer['role'] };
}

function submissionHandlers({ submission }: HazardReportsApi) {
  return {
    /** UC-3 steps 7–10; A1; A3; E2; E3. */
    submit: async (req, res) => {
      const auth = getAuth(req);
      const { lat, lng, locationSource, accuracyM, ...fields } = parseOrThrow(
        submitReportSchema,
        req.body ?? {},
      );
      const result = await submission.submit({
        ...fields,
        reporterId: auth.userId,
        reporterRole: auth.role as SubmitReportCommand['reporterRole'],
        location: { lat, lng, source: locationSource, accuracyM },
        photo: uploadedPhotoOf(req.file),
      });
      res
        .status(result.outcome === 'CREATED' ? 201 : 200)
        .json({ outcome: result.outcome, report: toReportDto(result.report) });
    },
  } satisfies Record<string, RequestHandler>;
}

function readingHandlers({ review, resolvePhoto }: HazardReportsApi) {
  return {
    /** Officers read the history; reporters read "My reports". */
    list: async (req, res) => {
      const auth = getAuth(req);
      const reports = isOfficer(auth.role)
        ? await review.history(toSearch(parseOrThrow(historyQuerySchema, req.query)))
        : await review.mine(auth.userId);
      res.json(reports.map(toReportDto));
    },
    /** UC-3 step 12. */
    detail: async (req, res) => {
      const auth = getAuth(req);
      const reader = { userId: auth.userId, isOfficer: isOfficer(auth.role) };
      res.json(toReportDto(await review.report(param(req.params.id), reader)));
    },
    /** UC-3 step 12: the photo itself. Only names this module stored are ever served. */
    photo: (req, res) => {
      const file = resolvePhoto(param(req.params.fileName));
      if (!file) throw PHOTO_NOT_FOUND();
      // The directory may sit under a dot-folder such as `.data`, which `send` refuses by default.
      res.sendFile(file, { dotfiles: 'allow' }, (error) => {
        if (error && !res.headersSent) {
          res.status(404).json({
            error: { code: 'PHOTO_NOT_FOUND', message: 'This photo does not exist.' },
          });
        }
      });
    },
  } satisfies Record<string, RequestHandler>;
}

function officerHandlers({ review }: HazardReportsApi) {
  return {
    /** UC-3 step 11. */
    queue: async (req, res) => {
      const { status } = parseOrThrow(queueQuerySchema, req.query);
      res.json((await review.queue(status)).map(toClusterSummaryDto));
    },
    /** UC-3 steps 11–12. */
    cluster: async (req, res) => {
      res.json(toClusterDetailDto(await review.cluster(param(req.params.id))));
    },
    /** UC-3 step 16. */
    escalate: async (req, res) => {
      res.json(toClusterDetailDto(await review.escalate(param(req.params.id), reviewOfficer(req))));
    },
    /** UC-3 steps 13–15. */
    verify: async (req, res) => {
      const result = await review.verify(param(req.params.id), reviewOfficer(req));
      res.json({
        report: toReportDto(result.report),
        cluster: toClusterSummaryDto(result.cluster),
      });
    },
    /** UC-3 A2. */
    reject: async (req, res) => {
      const { reason } = parseOrThrow(rejectSchema, req.body ?? {});
      const result = await review.reject(param(req.params.id), reviewOfficer(req), reason);
      res.json({
        report: toReportDto(result.report),
        cluster: toClusterSummaryDto(result.cluster),
      });
    },
  } satisfies Record<string, RequestHandler>;
}

/** HTTP routes for `/api/hazard-reports/*`: guards first, parse, call a service, map to a DTO. No rules here. */
export function createHazardReportsRouter(
  api: HazardReportsApi,
  { guards }: ModuleContext,
): Router {
  const submit = submissionHandlers(api);
  const reading = readingHandlers(api);
  const officer = officerHandlers(api);
  const reportersOnly = guards.requireRole('CITIZEN', 'COMMUNITY_VOLUNTEER');
  const officersOnly = guards.requireRole('DUTY_OFFICER', 'DMC_OFFICER');
  const anyUc3Role = guards.requireRole(
    'CITIZEN',
    'COMMUNITY_VOLUNTEER',
    'DUTY_OFFICER',
    'DMC_OFFICER',
  );
  const router = Router();
  router.use(guards.requireAuth);

  router.post('/', reportersOnly, api.upload, submit.submit);
  router.get('/', anyUc3Role, reading.list);
  // Fixed paths come before `/:id`, or Express would read "clusters" as a report id.
  router.get('/clusters', officersOnly, officer.queue);
  router.get('/clusters/:id', officersOnly, officer.cluster);
  router.post('/clusters/:id/escalate', officersOnly, officer.escalate);
  router.get('/photos/:fileName', anyUc3Role, reading.photo);
  router.get('/:id', anyUc3Role, reading.detail);
  router.post('/:id/verify', officersOnly, officer.verify);
  router.post('/:id/reject', officersOnly, officer.reject);
  return router;
}
