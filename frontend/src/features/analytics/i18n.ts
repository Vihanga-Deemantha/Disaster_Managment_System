import { useI18n, type Translate } from '@/shared/i18n/I18nProvider';
import { en, type MessageKey } from '@/shared/i18n/messages.en';
import type { AnalyticsFilter } from './types';
const keys: Record<string, MessageKey> = {
  'Impact Analytics': 'analytics.impact_analytics',
  'POST-EVENT ANALYSIS & REPORTING': 'analytics.post_event_analysis_reporting',
  'Analysis criteria': 'analytics.analysis_criteria',
  'Configure your post-event view': 'analytics.configure_your_post_event_view',
  'Disaster event': 'analytics.disaster_event',
  District: 'analytics.district',
  'Hazard type': 'analytics.hazard_type',
  'All events': 'analytics.all_events',
  'All districts': 'analytics.all_districts',
  'All hazards': 'analytics.all_hazards',
  From: 'analytics.from',
  To: 'analytics.to',
  'Event selection applies its district, hazard and date window.':
    'analytics.event_selection_applies_its_district_hazard_and_date_window',
  'Generate Analytics': 'analytics.generate_analytics',
  'Filters changed. Select Generate Analytics to apply them before exporting.':
    'analytics.filters_changed_select_generate_analytics_to_apply_them_before_exporting',
  'Retry analytics': 'analytics.retry_analytics',
  'Total alerts issued': 'analytics.total_alerts_issued',
  'Issued warnings in this period': 'analytics.issued_warnings_in_this_period',
  'Citizens reached': 'analytics.citizens_reached',
  'Delivered on at least one channel': 'analytics.delivered_on_at_least_one_channel',
  'Peak shelter occupancy': 'analytics.peak_shelter_occupancy',
  'People · daily shelter observations': 'analytics.people_daily_shelter_observations',
  'Relief distributed': 'analytics.relief_distributed',
  'Scoped dispatches · units kept separate': 'analytics.scoped_dispatches_units_kept_separate',
  'Resource allocation breakdown (Govt & NGO)': 'analytics.resource_allocation_breakdown_govt_ngo',
  'Read-only dispatch history': 'analytics.read_only_dispatch_history',
  Organisation: 'analytics.organisation',
  'Supply category': 'analytics.supply_category',
  Quantity: 'analytics.quantity',
  Status: 'analytics.status',
  Deployed: 'analytics.deployed',
  'No relief dispatches in your scope.': 'analytics.no_relief_dispatches_in_your_scope',
  'Shelter occupancy is seeded demonstration history; warning and allocation projections update from module events.':
    'analytics.shelter_occupancy_is_seeded_demonstration_history_warning_and_allocation_projections_update_from_module_events',
  'No organisation assigned': 'analytics.no_organisation_assigned',
  Analytics: 'analytics.analytics',
  'Export Audit Report': 'analytics.export_audit_report',
  'Offline ·': 'analytics.offline',
  'No saved results available.': 'analytics.no_saved_results_available',
  'Generate and Export require a connection.': 'analytics.generate_and_export_require_a_connection',
  'Relief organisation': 'analytics.relief_organisation',
  'All organisations': 'analytics.all_organisations',
  'Loading impact analysis…': 'analytics.loading_impact_analysis',
  'No data for these filters': 'analytics.no_data_for_these_filters',
  'Try all events or widen your district and date range. Export is disabled until records are available.':
    'analytics.try_all_events_or_widen_your_district_and_date_range_export_is_disabled_until_records_are_available',
  'National impact summary': 'analytics.national_impact_summary',
  'View detailed event log': 'analytics.view_detailed_event_log',
  'Export history': 'analytics.export_history',
  'Timestamped & audited': 'analytics.timestamped_audited',
  Generated: 'analytics.generated',
  'Format / audience': 'analytics.format_audience',
  'File SHA-256': 'analytics.file_sha_256',
  'No file generated': 'analytics.no_file_generated',
  'No exports yet. Generate analytics, then export a report.':
    'analytics.no_exports_yet_generate_analytics_then_export_a_report',
  'Relief distribution by district & organisation':
    'analytics.relief_distribution_by_district_organisation',
  'View dispatch log →': 'analytics.view_dispatch_log',
  'Alert delivery timeline vs reach': 'analytics.alert_delivery_timeline_vs_reach',
  'Reach %': 'analytics.reach',
  'Citizens reached (%)': 'analytics.citizens_reached_pct',
  'View daily reach and event logs': 'analytics.view_daily_reach_and_event_logs',
  'No alert records for these filters.': 'analytics.no_alert_records_for_these_filters',
  'Shelter occupancy vs capacity': 'analytics.shelter_occupancy_vs_capacity',
  People: 'analytics.people',
  'Capacity (people)': 'analytics.capacity_people',
  'Occupancy (people)': 'analytics.occupancy_people',
  'View daily occupancy and event logs': 'analytics.view_daily_occupancy_and_event_logs',
  'No shelter observations for these filters.':
    'analytics.no_shelter_observations_for_these_filters',
  'System alerts & citizen reach': 'analytics.system_alerts_citizen_reach',
  'Shelter capacity & occupancy': 'analytics.shelter_capacity_occupancy',
  'Government & NGO resource allocations': 'analytics.government_ngo_resource_allocations',
  'Report generation failed.': 'analytics.report_generation_failed',
  'Export options & scope configuration': 'analytics.export_options_scope_configuration',
  Cancel: 'analytics.cancel',
  'Generating · automatically retries once…': 'analytics.generating_automatically_retries_once',
  'Confirm & Download': 'analytics.confirm_download',
  'Select at least one dataset.': 'analytics.select_at_least_one_dataset',
  'Export is disabled offline. Reconnect to generate a verified report.':
    'analytics.export_is_disabled_offline_reconnect_to_generate_a_verified_report',
  '1. Select target format': 'analytics.1_select_target_format',
  'Executive PDF document (.pdf)': 'analytics.executive_pdf_document_pdf',
  'Raw data spreadsheet (.csv)': 'analytics.raw_data_spreadsheet_csv',
  'Timestamped report with filtered records': 'analytics.timestamped_report_with_filtered_records',
  'Filtered rows for statistical analysis': 'analytics.filtered_rows_for_statistical_analysis',
  '2. Audience & authorisation level': 'analytics.2_audience_authorisation_level',
  'Internal · full audit detail': 'analytics.internal_full_audit_detail',
  'External donors · personal data removed': 'analytics.external_donors_personal_data_removed',
  '3. Include datasets': 'analytics.3_include_datasets',
  'The server retries generation once automatically.':
    'analytics.the_server_retries_generation_once_automatically',
  Retry: 'analytics.retry',
  'Export CSV instead': 'analytics.export_csv_instead',
  'Report generated & downloaded': 'analytics.report_generated_downloaded',
  'Download again': 'analytics.download_again',
  'Uses current filters': 'analytics.uses_current_filters',
  'matching records across all datasets': 'analytics.matching_records_across_all_datasets',
  'Organisation scope stays enforced for both audiences. NGO/Donor reports contain public figures and their own relief records.':
    'analytics.organisation_scope_stays_enforced_for_both_audiences_ngo_donor_reports_contain_public_figures_and_their_own_relief_records',
  'Unable to load event log.': 'analytics.unable_to_load_event_log',
  'Detailed event log': 'analytics.detailed_event_log',
  Previous: 'analytics.previous',
  Page: 'analytics.page',
  Next: 'analytics.next',
  'Loading event log…': 'analytics.loading_event_log',
  'matching records': 'analytics.matching_records',
  'Time / dataset': 'analytics.time_dataset',
  Details: 'analytics.details',
  'No event logs for this period.': 'analytics.no_event_logs_for_this_period',
  'Choose a valid start date.': 'analytics.choose_a_valid_start_date',
  'Choose a valid end date.': 'analytics.choose_a_valid_end_date',
  'End date must be on or after start date.': 'analytics.end_date_must_be_on_or_after_start_date',
  'End date cannot be in the future.': 'analytics.end_date_cannot_be_in_the_future',
  'Date range cannot exceed 12 months.': 'analytics.date_range_cannot_exceed_12_months',
  'Unknown district.': 'analytics.unknown_district',
  'Unknown hazard type.': 'analytics.unknown_hazard_type',
  'Unknown event.': 'analytics.unknown_event',
  'District is outside this event.': 'analytics.district_is_outside_this_event',
  'Hazard does not match this event.': 'analytics.hazard_does_not_match_this_event',
  'Dates must fall within the selected event.':
    'analytics.dates_must_fall_within_the_selected_event',
  'Unable to load analytics.': 'analytics.unable_to_load_analytics',
  'No cached analytics on this device. Reconnect to generate your first view.':
    'analytics.no_cached_analytics_on_this_device_reconnect_to_generate_your_first_view',
  alerts: 'analytics.alerts',
  occupancy: 'analytics.occupancy',
  distribution: 'analytics.distribution',
  people: 'analytics.people_lower',
  'attempt(s)': 'analytics.attempt_s',
  COMPLETED: 'analytics.completed',
  FAILED: 'analytics.failed',
  INTERNAL: 'analytics.internal',
  EXTERNAL: 'analytics.external',
  'Showing:': 'analytics.showing',
  '· Public alert and shelter totals; your organisation’s relief only.':
    'analytics.public_alert_and_shelter_totals_your_organisation_s_relief_only',
  'view · Evaluate alert reach, shelter trends and relief distribution':
    'analytics.view_evaluate_alert_reach_shelter_trends_and_relief_distribution',
  'records · as of': 'analytics.records_as_of',
};
export function analyticsText(t: Translate, text: string): string {
  const district = ('district.' + text) as MessageKey;
  if (district in en) return t(district);
  const role = Object.keys(en).find(
    (key) => key.startsWith('role.') && en[key as MessageKey] === text,
  );
  if (role) return t(role as MessageKey);
  const hazard = ('analytics.' + text.toLowerCase()) as MessageKey;
  if (
    ['flood', 'landslide', 'cyclone', 'tsunami', 'drought', 'lightning'].includes(
      text.toLowerCase(),
    )
  )
    return t(hazard);
  const key = keys[text];
  return key ? t(key) : text;
}
export function useAnalyticsText() {
  const { t } = useI18n();
  return (text: string) => analyticsText(t, text);
}
export function localizedFilterSummary(filter: AnalyticsFilter, t: Translate): string {
  return [
    filter.district === 'ALL'
      ? t('analytics.all_districts')
      : t(('district.' + filter.district) as MessageKey),
    filter.hazardType === 'ALL'
      ? t('analytics.all_hazards')
      : analyticsText(t, filter.hazardType.toLowerCase()),
    filter.from + ' – ' + filter.to,
    filter.organizationId,
  ]
    .filter(Boolean)
    .join(' · ');
}
