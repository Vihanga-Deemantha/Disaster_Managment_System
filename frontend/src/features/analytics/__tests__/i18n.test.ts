import type { Translate } from '@/shared/i18n/I18nProvider';
import { en } from '@/shared/i18n/messages.en';
import { localizedFilterSummary } from '../i18n';
import { dashboard } from '../testing/fixtures';

const t: Translate = (key) => en[key];

describe('UC-4 localized filter summaries', () => {
  it('describes a selected district, hazard, date range and organisation', () => {
    const summary = localizedFilterSummary(
      {
        ...dashboard.filter,
        district: 'RATNAPURA',
        hazardType: 'FLOOD',
        organizationId: 'org-red-cross',
      },
      t,
    );
    expect(summary).toContain(en['district.RATNAPURA']);
    expect(summary).toContain(en['analytics.flood']);
    expect(summary).toContain(dashboard.filter.from);
    expect(summary).toContain(dashboard.filter.to);
    expect(summary.endsWith('org-red-cross')).toBe(true);
    expect(summary).not.toContain(en['analytics.all_districts']);
    expect(summary).not.toContain(en['analytics.all_hazards']);
  });

  it('describes all districts and hazards without an unselected organisation', () => {
    const summary = localizedFilterSummary(
      { ...dashboard.filter, district: 'ALL', hazardType: 'ALL', organizationId: undefined },
      t,
    );
    expect(summary).toContain(en['analytics.all_districts']);
    expect(summary).toContain(en['analytics.all_hazards']);
    expect(summary.endsWith(dashboard.filter.to)).toBe(true);
    expect(summary).not.toContain('undefined');
  });
});
