import { Router } from 'express';
import { z } from 'zod';
import { getAuth } from '@shared/auth/api/authContext';
import type { ModuleContext } from '@shared/module';
import { ValidationError } from '@shared/errors/DomainError';
import type { AnalyticsController } from '../application/AnalyticsController';
import type { PdfReportExporter } from '../infrastructure/ReportExporters';
const filterSchema = z
  .object({
    eventId: z.string().min(1).optional(),
    district: z.string(),
    hazardType: z.string(),
    from: z.string(),
    to: z.string(),
    organizationId: z.string().min(1).optional(),
  })
  .strict();
const reportSchema = z
  .object({
    filter: filterSchema,
    format: z.enum(['PDF', 'CSV']),
    audience: z.enum(['INTERNAL', 'EXTERNAL']),
    datasets: z.array(z.enum(['alerts', 'occupancy', 'distribution'])).min(1),
  })
  .strict();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        code: 'INVALID_FILTER',
        field: issue.path.join('.'),
        message: issue.message,
      })),
      'Invalid analytics request.',
      'INVALID_FILTER',
    );
  return result.data;
}
/** UC-4 HTTP parsing and mapping. */
export function analyticsRouter(controller: AnalyticsController, ctx: ModuleContext): Router {
  const router = Router();
  router.use(
    ['/events', '/summary', '/query', '/event-log', '/reports'],
    ctx.guards.requireAuth,
    ctx.guards.requireRole('DMC_OFFICER', 'NGO_MANAGER', 'DONOR'),
  );
  router.get('/events', async (_req, res) => {
    res.json({ events: await controller.getEvents() });
  });
  router.get('/summary', async (req, res) => {
    res.json(await controller.getSummary(getAuth(req)));
  });
  router.post('/query', async (req, res) => {
    res.json(await controller.fetchImpactData(parse(filterSchema, req.body), getAuth(req)));
  });
  registerEventLogRoute(router, controller);
  router.get('/reports', async (req, res) => {
    res.json({ reports: await controller.getReports(getAuth(req)) });
  });
  registerExportRoute(router, controller);
  return router;
}
function registerEventLogRoute(router: Router, controller: AnalyticsController) {
  router.get('/event-log', async (req, res) => {
    const { page = '1', dataset, day, ...input } = req.query;
    const selection = parse(
      z.object({
        dataset: z.enum(['alerts', 'occupancy', 'distribution']).optional(),
        day: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      }),
      { dataset, day },
    );
    res.json(
      await controller.getEventLog(
        parse(filterSchema, input),
        getAuth(req),
        Number(page),
        selection.dataset,
        selection.day,
      ),
    );
  });
}
function registerExportRoute(router: Router, controller: AnalyticsController) {
  router.post('/reports', async (req, res) => {
    const { filter, ...options } = parse(reportSchema, req.body);
    const { bytes, metadata } = await controller.generateImpactReport(
      filter,
      options,
      getAuth(req),
    );
    res.set({
      'Content-Type': options.format === 'PDF' ? 'application/pdf' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="impact-${metadata.reportId}.${options.format.toLowerCase()}"`,
      'X-Report-Checksum': metadata.checksum,
      'X-Report-Id': metadata.reportId,
      'X-Report-Generated-At': metadata.generatedAt,
      'X-Report-Attempts': String(metadata.attempts),
      'Cache-Control': 'no-store',
    });
    res.send(bytes);
  });
}
export function analyticsDevRouter(pdf: PdfReportExporter, ctx: ModuleContext): Router {
  const router = Router();
  router.put(
    '/pdf-exporter',
    ctx.guards.requireAuth,
    ctx.guards.requireRole('DMC_OFFICER'),
    (req, res) => {
      const { mode } = parse(
        z.object({ mode: z.enum(['OK', 'FAIL_ONCE', 'FAIL_ALWAYS']) }),
        req.body,
      );
      pdf.setMode(mode);
      res.json({ mode });
    },
  );
  return router;
}
