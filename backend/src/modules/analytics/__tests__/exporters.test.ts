import {
  CsvReportExporter,
  PdfReportExporter,
  PdfWriter,
  csvCell,
} from '../infrastructure/ReportExporters';
import { reportPages } from '../infrastructure/ReportLayout';
import { AudienceRedactor, ImpactReportBuilder } from '../application/ImpactReportBuilder';
import { alert, occupancy, dispatch, input } from '../testing/fixtures';
import type { ExportOptions } from '../domain/types';
const options: ExportOptions = {
  format: 'PDF',
  audience: 'INTERNAL',
  datasets: ['alerts', 'occupancy', 'distribution'],
};
const model = new ImpactReportBuilder('report-1', input, options, '2026-10-08T04:00:00Z')
  .withSections({ alerts: [alert], occupancy: [occupancy], distribution: [dispatch] })
  .withChecksum('abc123')
  .build();

describe('Formatted impact exports', () => {
  it('CSV has a BOM, one rectangular header and flattened channel columns', async () => {
    const csv = (await new CsvReportExporter().export(model)).toString();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const rows = csv.trim().split('\r\n');
    expect(rows).toHaveLength(4);
    const columns = (line: string) =>
      [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map((match) => match[1]);
    const headers = columns(rows[0]!);
    expect(headers).toContain('byChannel.SMS.delivered');
    expect(headers).toContain('shelterName');
    expect(headers).not.toContain('details');
    rows.slice(1).forEach((row) => expect(columns(row)).toHaveLength(headers.length));
    expect(csv).not.toContain('{');
    expect(csvCell(-12)).toBe('"-12"');
  });
  it('external files preserve redaction in both formats', async () => {
    const external = { ...options, audience: 'EXTERNAL' as const };
    const report = {
      ...model,
      options: external,
      sections: new AudienceRedactor().redact(
        { alerts: [alert], occupancy: [occupancy], distribution: [dispatch] },
        external,
      ),
    };
    for (const exporter of [new CsvReportExporter(), new PdfReportExporter(new PdfWriter())]) {
      const file = (await exporter.export(report)).toString();
      expect(file).not.toContain('Private officer');
      expect(file).not.toContain('private-citizen');
      expect(file).not.toContain('pendingRetry');
    }
  });
  it('PDF includes summary, readable tables and repeated headers without raw JSON', () => {
    const large = {
      ...model,
      sections: {
        distribution: Array.from({ length: 60 }, (_, i) => ({
          ...dispatch,
          id: `dispatch-${i}`,
          organizationName:
            i === 59
              ? 'Final organisation'
              : 'A long organisation name with several words '.repeat(3),
        })),
      },
    };
    const pages = reportPages(large);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.join('\n')).toContain('Report overview');
    expect(pages.join('\n')).toContain('Relief resource allocations \\(continued\\)');
    expect(pages.join('\n')).toContain('Final organisation');
    expect(pages.join('\n')).not.toContain('"organizationName":');
    const pdf = new PdfWriter().writeReport(large).toString();
    expect(pdf).toContain(`/Count ${pages.length}`);
    expect(pdf).toContain(`Page ${pages.length} of ${pages.length}`);
  });
  it('empty selected datasets show an explicit message and a header-only CSV', async () => {
    const empty = { ...model, sections: { alerts: [] } };
    expect(reportPages(empty).join('\n')).toContain('No matching records');
    expect(
      (await new CsvReportExporter().export(empty)).toString().trim().split('\r\n'),
    ).toHaveLength(1);
  });
  it('CSV safely quotes object-valued cells', () => {
    expect(csvCell({ note: 'a "quoted" value' })).toBe('"{""note"":""a \\""quoted\\"" value""}"');
    expect(csvCell(null)).toBe('"null"');
  });
  it('PDF handles an unselected event, organisation scope and zero delivery/capacity totals', () => {
    const pages = reportPages({
      ...model,
      filter: { ...input, eventId: undefined, organizationId: 'org-red-cross' },
      sections: {
        alerts: [{ ...alert, targeted: 0, reached: 0 }],
        occupancy: [{ ...occupancy, occupancy: 0, capacity: 0 }],
        distribution: [],
      },
    }).join('\n');
    expect(pages).toContain('Organisation scope: org-red-cross');
    expect(pages).not.toContain('(Event:');
    expect(pages).toContain('0.0%');
    expect(pages).toContain('No supplies recorded');
    expect(pages).not.toMatch(/NaN|Infinity/);
  });
  it('PDF renders a missing legacy supply label as an empty cell', () => {
    const legacy = { ...dispatch, supplyCategory: undefined } as unknown as typeof dispatch;
    const pages = reportPages({ ...model, sections: { distribution: [legacy] } }).join('\n');
    expect(pages).toContain('Relief resource allocations');
    expect(pages).not.toContain('undefined');
  });
  it.each([24, 26, 60])(
    'PDF paginates a %s-line title without losing verification details',
    (lines) => {
      const pages = reportPages({
        ...model,
        title: Array.from({ length: lines }, (_, i) => `Title line ${i + 1}`).join('\n'),
      });
      expect(pages.length).toBeGreaterThan(1);
      expect(pages.join('\n')).toContain(`Title line ${lines}`);
      expect(pages.join('\n')).toContain('Report verification');
      expect(pages.join('\n')).toContain('Content SHA-256: abc123');
    },
  );
  it('PDF wraps long unbroken identifiers and retains the last characters', () => {
    const pages = reportPages({ ...model, title: 'X'.repeat(200) + 'END' }).join('\n');
    expect(pages).toContain('END');
    expect(pages).not.toContain('X'.repeat(200));
  });
});
