import { DESCRIPTION_MAX_CHARS, REPORT_HAZARD_TYPES } from './reportRules';
import type { DraftLocation, ReportDraft, ValidReportDraft } from './types';
import { validatePickedPhoto, type PhotoProblem } from './validatePickedPhoto';

export type DraftProblem =
  | PhotoProblem
  | 'HAZARD_TYPE_REQUIRED'
  | 'LOCATION_REQUIRED'
  | 'LOCATION_INVALID'
  | 'LOCATION_OUTSIDE_SRI_LANKA'
  | 'DESCRIPTION_TOO_LONG';
export type DraftValidation =
  { ok: true; value: ValidReportDraft } | { ok: false; problems: DraftProblem[] };

function validCoordinates({ lat, lng }: DraftLocation): boolean {
  return [lat, lng].every(Number.isFinite) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
function insideSriLanka({ lat, lng }: DraftLocation): boolean {
  return lat >= 5.7 && lat <= 10 && lng >= 79.4 && lng <= 82.1;
}
function locationProblem(location?: DraftLocation): DraftProblem | undefined {
  if (!location) return 'LOCATION_REQUIRED';
  if (!validCoordinates(location)) return 'LOCATION_INVALID';
  if (!insideSriLanka(location)) return 'LOCATION_OUTSIDE_SRI_LANKA';
  return undefined;
}
function draftProblems(draft: ReportDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (!draft.hazardType || !REPORT_HAZARD_TYPES.includes(draft.hazardType))
    problems.push('HAZARD_TYPE_REQUIRED');
  const locationError = locationProblem(draft.location);
  if (locationError) problems.push(locationError);
  if ([...draft.description.trim()].length > DESCRIPTION_MAX_CHARS)
    problems.push('DESCRIPTION_TOO_LONG');
  return problems;
}
export function validateReportDraft(draft: ReportDraft): DraftValidation {
  const problems = draftProblems(draft);
  const photo = draft.photo ? validatePickedPhoto(draft.photo) : undefined;
  if (photo && !photo.ok) problems.push(photo.problem);
  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    value: {
      hazardType: draft.hazardType!,
      description: draft.description.trim(),
      location: { ...draft.location! },
      photo: photo?.ok ? photo.photo : undefined,
    },
  };
}
