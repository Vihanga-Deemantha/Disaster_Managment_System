import { createHash } from 'node:crypto';
import { ValidationError } from '@shared/errors/DomainError';
import type { ChecksumCalculator, ReportExporter } from '../application/ports';
import type { ReportModel } from '../domain/types';

export class Sha256ChecksumCalculator implements ChecksumCalculator {
  calculate(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
  }
}
/** A2: RFC-style CSV escaping plus spreadsheet formula injection protection. */
export function csvCell(value: unknown): string {
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function reportLines(model: ReportModel): string[] {
  return [
    model.title,
    `Report: ${model.reportId}`,
    `Generated: ${model.generatedAt}`,
    `Audience: ${model.options.audience}`,
    `Filters: ${JSON.stringify(model.filter)}`,
    `Content SHA-256: ${model.contentChecksum}`,
    'The final file SHA-256 is provided with the download and in export history.',
    ...Object.entries(model.sections).flatMap(([dataset, records]) => [
      dataset.toUpperCase(),
      ...records.map((row) => JSON.stringify(row)),
    ]),
  ];
}
export class CsvReportExporter implements ReportExporter {
  async export(model: ReportModel): Promise<Buffer> {
    const rows = reportLines({ ...model, sections: {} }).map((line) => `# ${csvCell(line)}`);
    rows.push(CSV_HEADERS.map(csvCell).join(','));
    for (const [dataset, records] of Object.entries(model.sections)) {
      for (const fact of records) {
        const row = fact as unknown as Record<string, unknown>;
        rows.push(
          [
            dataset,
            row.id,
            row.at,
            row.district,
            row.hazardType,
            row.organizationName,
            row.supplyCategory,
            row.quantity,
            row.unit,
            row.targeted,
            row.reached,
            row.occupancy,
            row.capacity,
            row,
          ]
            .map(csvCell)
            .join(','),
        );
      }
    }
    return Buffer.from(rows.join('\r\n') + '\r\n', 'utf8');
  }
}
const CSV_HEADERS = [
  'dataset',
  'id',
  'date',
  'district',
  'hazardType',
  'organization',
  'supplyCategory',
  'quantity',
  'unit',
  'targeted',
  'reached',
  'occupancy',
  'capacity',
  'details',
];

/** Small dependency-free PDF adapter. Valid paginated text document, no network PDF service. */
export class PdfWriter {
  write(lines: string[]): Buffer {
    const wrapped = lines.flatMap((line) => line.match(/.{1,95}/g) ?? ['']);
    const pages: string[][] = [];
    for (let i = 0; i < wrapped.length; i += 48) pages.push(wrapped.slice(i, i + 48));
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    const kids: string[] = [];
    for (const [index, page] of pages.entries()) {
      const pageId = objects.length + 1;
      kids.push(`${pageId} 0 R`);
      const content = [
        'BT /F1 10 Tf 14 TL 40 800 Td',
        ...page.map(
          (line) => `(${line.replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&')}) Tj T*`,
        ),
        `(${index + 1} / ${pages.length}) Tj ET`,
      ].join('\n');
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
        `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
      );
    }
    objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(' ')}] >>`;
    return this.serialize(objects);
  }
  private serialize(objects: string[]): Buffer {
    let document = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, i) => {
      offsets.push(Buffer.byteLength(document));
      document += `${i + 1} 0 obj\n${object}\nendobj\n`;
    });
    const start = Buffer.byteLength(document);
    document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
      .join(
        '',
      )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
    return Buffer.from(document);
  }
}
export type PdfMode = 'OK' | 'FAIL_ONCE' | 'FAIL_ALWAYS';
export class PdfReportExporter implements ReportExporter {
  private mode: PdfMode = 'OK';
  constructor(private readonly writer: PdfWriter) {}
  setMode(mode: PdfMode): void {
    this.mode = mode;
  }
  async export(model: ReportModel): Promise<Buffer> {
    if (this.mode !== 'OK') {
      if (this.mode === 'FAIL_ONCE') this.mode = 'OK';
      throw new Error('PDF generation unavailable.');
    }
    return this.writer.write(reportLines(model));
  }
}
/** UCD-16: exactly two exporter strategies. */
export class ReportExporterFactory {
  constructor(
    private readonly pdf: ReportExporter,
    private readonly csv: ReportExporter,
  ) {}
  create(format: string): ReportExporter {
    if (format === 'PDF') return this.pdf;
    if (format === 'CSV') return this.csv;
    throw new ValidationError([
      { code: 'INVALID_FILTER', field: 'format', message: 'Choose PDF or CSV.' },
    ]);
  }
}
