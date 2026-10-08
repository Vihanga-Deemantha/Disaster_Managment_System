import type { AuthContext } from '@shared/auth/domain/types';
import type { AuditLog } from '@shared/audit/AuditLog';
import type { Clock } from '@shared/time/Clock';
import type { IdGenerator } from '@shared/ids/IdGenerator';
import {
  ConflictError,
  ServiceUnavailableError,
  ValidationError,
} from '@shared/errors/DomainError';
import { AnalyticsFilter } from '../domain/AnalyticsFilter';
import { ImpactReport } from '../domain/ImpactReport';
import type { ExportOptions, FilterInput, ReportMetadata } from '../domain/types';
import type { AnalyticsStore, ChecksumCalculator, ExporterFactory } from './ports';
import { type AccessScope } from './AccessScope';
import { assembleMetrics } from './MetricAggregator';
import {
  AudienceRedactor,
  ImpactReportBuilder,
  validateExportOptions,
} from './ImpactReportBuilder';

export interface AnalyticsDeps {
  store: AnalyticsStore;
  scope: AccessScope;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditLog;
  exporters: ExporterFactory;
  checksum: ChecksumCalculator;
}

/** SD-4 control object; steps 2–13, A1–A3, E1–E4. */
export class AnalyticsController {
  constructor(private readonly deps: AnalyticsDeps) {}
  getEvents() {
    return this.deps.store.list();
  }
  async validateFilters(input: FilterInput, user: AuthContext) {
    const valid = AnalyticsFilter.create(input, await this.getEvents(), this.deps.clock.now());
    return AnalyticsFilter.create(
      await this.deps.scope.withScope(valid.value, user),
      await this.getEvents(),
      this.deps.clock.now(),
    );
  }
  private async read(filter: AnalyticsFilter) {
    const [alerts, occupancy, distribution] = await Promise.all([
      this.deps.store.countReach(filter),
      this.deps.store.occupancySeries(filter),
      this.deps.store.distributionByDistrict(filter),
    ]);
    return { alerts, occupancy, distribution };
  }
  async fetchImpactData(input: FilterInput, user: AuthContext) {
    const filter = await this.validateFilters(input, user);
    const facts = await this.read(filter);
    return {
      filter: filter.value,
      metrics: assembleMetrics(facts.alerts, facts.occupancy, facts.distribution),
      generatedAt: this.deps.clock.now().toISOString(),
    };
  }
  async getSummary(user: AuthContext) {
    const events = await this.getEvents();
    const event = [...events].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    const today = this.deps.clock.now().toISOString().slice(0, 10);
    return this.fetchImpactData(
      event
        ? {
            eventId: event.eventId,
            district: 'ALL',
            hazardType: 'ALL',
            from: event.startDate,
            to: event.endDate,
          }
        : { district: 'ALL', hazardType: 'ALL', from: today, to: today },
      user,
    );
  }
  /** A3: paged, scoped event log; NGO/Donor personal and failure details remain redacted. */
  async getEventLog(
    input: FilterInput,
    user: AuthContext,
    page: number,
    dataset?: string,
    day?: string,
  ) {
    if (!Number.isInteger(page) || page < 1)
      throw new ValidationError([
        { code: 'INVALID_FILTER', field: 'page', message: 'Page must be a positive integer.' },
      ]);
    if (dataset && !['alerts', 'occupancy', 'distribution'].includes(dataset))
      throw new ValidationError([
        { code: 'INVALID_FILTER', field: 'dataset', message: 'Unknown dataset.' },
      ]);
    const filter = await this.validateFilters(input, user);
    const facts = await this.read(filter);
    const sections = new AudienceRedactor().redact(facts, {
      format: 'CSV',
      audience: user.role === 'DMC_OFFICER' ? 'INTERNAL' : 'EXTERNAL',
      datasets: ['alerts', 'occupancy', 'distribution'],
    });
    const rows = Object.entries(sections)
      .flatMap(([type, records]) => records.map((record) => ({ dataset: type, ...record })))
      .filter(
        (row) => (!dataset || row.dataset === dataset) && (!day || row.at.slice(0, 10) === day),
      )
      .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
    return { rows: rows.slice((page - 1) * 20, page * 20), total: rows.length, page, pageSize: 20 };
  }
  getReports(user: AuthContext) {
    return this.deps.store.reports(user.role === 'DMC_OFFICER' ? undefined : user.userId);
  }
  /** SC4-02 / SD4-01: export always reuses the complete validated scoped filter. */
  async generateImpactReport(input: FilterInput, options: ExportOptions, user: AuthContext) {
    validateExportOptions(options);
    const filter = await this.validateFilters(input, user);
    const facts = await this.read(filter);
    const sections = new AudienceRedactor().redact(facts, {
      ...options,
      audience: user.role === 'DMC_OFFICER' ? options.audience : 'EXTERNAL',
    });
    if (!Object.values(sections).some((records) => records.length))
      throw new ConflictError(
        'NO_DATA',
        'No records in the selected datasets. Widen your filters.',
      );
    const metadata: ReportMetadata = {
      reportId: this.deps.ids.next(),
      filter: filter.value,
      options,
      generatedBy: user.userId,
      generatedAt: this.deps.clock.now().toISOString(),
      status: 'FAILED',
      attempts: 0,
    };
    const builder = new ImpactReportBuilder(
      metadata.reportId,
      filter.value,
      options,
      metadata.generatedAt,
    ).withSections(sections);
    const contentChecksum = this.deps.checksum.calculate(
      Buffer.from(JSON.stringify(builder.build())),
    );
    const report = new ImpactReport(metadata, builder.withChecksum(contentChecksum).build());
    return this.renderReport(report, user);
  }
  private async renderReport(report: ImpactReport, user: AuthContext) {
    const exporter = this.deps.exporters.create(report.metadata.options.format);
    let bytes: Buffer | undefined;
    for (let attempt = 1; attempt <= 2; attempt++) {
      report.metadata.attempts = attempt;
      try {
        bytes = await report.render(exporter);
        break;
      } catch {
        /* BR5: one automatic retry. */
      }
    }
    if (bytes) report.saveMetadata(this.deps.checksum.calculate(bytes));
    await this.deps.store.saveReport(report.metadata);
    await this.deps.audit.record({
      action: `analytics.export.${report.metadata.status.toLowerCase()}`,
      actorId: user.userId,
      actorRole: user.role,
      subjectType: 'ImpactReport',
      subjectId: report.metadata.reportId,
      occurredAt: this.deps.clock.now(),
      details: { checksum: report.metadata.checksum, attempts: report.metadata.attempts },
    });
    if (!bytes)
      throw new ServiceUnavailableError(
        'EXPORT_FAILED',
        'Report generation failed after one automatic retry.',
        { canRetry: true, csvAvailable: true },
      );
    return { bytes, metadata: report.metadata };
  }
}
