import type { ModuleContext, ModuleRegistration } from '@shared/module';
import type { AnalyticsStore } from './application/ports';
import { AnalyticsController } from './application/AnalyticsController';
import { AccessScope } from './application/AccessScope';
import { MongoAnalyticsStore } from './infrastructure/AnalyticsStore';
import { AllocationDeployedHandler, WarningIssuedHandler } from './infrastructure/EventHandlers';
import {
  CsvReportExporter,
  PdfReportExporter,
  PdfWriter,
  ReportExporterFactory,
  Sha256ChecksumCalculator,
} from './infrastructure/ReportExporters';
import { analyticsDevRouter, analyticsRouter } from './api/analytics.http';

/**
 * UC-4 Post-Event Impact Analysis: wiring only. Build the concrete classes from `ctx` here and
 * nowhere else, then return the router. Replace the empty router when `api/analytics.http.ts` exists.
 */
export function createAnalyticsModule(
  ctx: ModuleContext,
  store: AnalyticsStore = new MongoAnalyticsStore(),
): ModuleRegistration {
  const pdf = new PdfReportExporter(new PdfWriter());
  const controller = new AnalyticsController({
    store,
    scope: new AccessScope(ctx.auditLog, ctx.clock),
    clock: ctx.clock,
    ids: ctx.ids,
    audit: ctx.auditLog,
    checksum: new Sha256ChecksumCalculator(),
    exporters: new ReportExporterFactory(pdf, new CsvReportExporter()),
  });
  const warnings = new WarningIssuedHandler(store);
  const allocations = new AllocationDeployedHandler(store);
  ctx.eventBus.subscribe('WarningIssued', (event) => warnings.handle(event));
  ctx.eventBus.subscribe('AllocationDeployed', (event) => allocations.handle(event));
  return {
    name: 'analytics',
    mountPath: '/api/analytics',
    router: analyticsRouter(controller, ctx),
    ...(!ctx.config.isProduction ? { devRouter: analyticsDevRouter(pdf, ctx) } : {}),
  };
}
