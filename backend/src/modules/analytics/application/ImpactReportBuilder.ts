import type { ExportOptions, Facts, FilterInput, ReportModel } from '../domain/types';
import { DATASETS } from '../domain/types';
import { ValidationError } from '@shared/errors/DomainError';

/** SC4-02 / BR3: allow-list fields rather than relying on a blacklist of personal data. */
export class AudienceRedactor {
  redact(facts: Facts, options: ExportOptions): Partial<Facts> {
    const sections: Partial<Facts> = {};
    if (options.datasets.includes('alerts'))
      sections.alerts = facts.alerts.map((f) =>
        options.audience === 'INTERNAL'
          ? { ...f }
          : ({
              id: f.id,
              eventId: f.eventId,
              district: f.district,
              hazardType: f.hazardType,
              at: f.at,
              targeted: f.targeted,
              reached: f.reached,
              byChannel: Object.fromEntries(
                Object.entries(f.byChannel).map(([channel, value]) => [
                  channel,
                  { sent: value.sent, delivered: value.delivered },
                ]),
              ),
            } as Facts['alerts'][number]),
      );
    if (options.datasets.includes('occupancy'))
      sections.occupancy = facts.occupancy.map((f) => ({ ...f }));
    if (options.datasets.includes('distribution'))
      sections.distribution = this.redactDistribution(facts, options);
    return sections;
  }
  private redactDistribution(facts: Facts, options: ExportOptions) {
    return facts.distribution.map((f) =>
      options.audience === 'INTERNAL'
        ? { ...f }
        : {
            id: f.id,
            eventId: f.eventId,
            district: f.district,
            hazardType: f.hazardType,
            at: f.at,
            organizationId: f.organizationId,
            organizationName: f.organizationName,
            supplyCategory: f.supplyCategory,
            quantity: f.quantity,
            unit: f.unit,
          },
    );
  }
}

export function validateExportOptions(options: ExportOptions): void {
  const fields = [];
  if (!['PDF', 'CSV'].includes(options.format))
    fields.push({ code: 'INVALID_FILTER', field: 'format', message: 'Choose PDF or CSV.' });
  if (!['INTERNAL', 'EXTERNAL'].includes(options.audience))
    fields.push({ code: 'INVALID_FILTER', field: 'audience', message: 'Choose an audience.' });
  if (
    !Array.isArray(options.datasets) ||
    !options.datasets.length ||
    options.datasets.some((d) => !DATASETS.includes(d))
  )
    fields.push({
      code: 'INVALID_FILTER',
      field: 'datasets',
      message: 'Select at least one valid dataset.',
    });
  if (fields.length) throw new ValidationError(fields);
}

/** UC-4 step 12: Builder keeps one validated, scoped filter on the report (SD4-01). */
export class ImpactReportBuilder {
  private model: ReportModel;
  constructor(reportId: string, filter: FilterInput, options: ExportOptions, generatedAt: string) {
    this.model = {
      reportId,
      title: 'Post-Event Impact & Relief Report',
      filter,
      options,
      generatedAt,
      contentChecksum: '',
      sections: {},
    };
  }
  withSections(sections: Partial<Facts>): this {
    this.model.sections = sections;
    return this;
  }
  withChecksum(checksum: string): this {
    this.model.contentChecksum = checksum;
    return this;
  }
  build(): ReportModel {
    return { ...this.model };
  }
}
