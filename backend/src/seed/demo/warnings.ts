import { CHANNELS, type Channel, type HazardType, type Severity } from '@shared/contracts/enums';
import type { Messages } from '../../modules/warnings/domain/types';
import { TargetArea, type TargetAreaProps } from '../../modules/warnings/domain/TargetArea';
import { Warning } from '../../modules/warnings/domain/Warning';
import { ALL_WORKING, failingEvery } from './gateways';
import type { HazardHistory } from './hazardReports';
import type { Actor, DemoWorld } from './world';

/**
 * UC-1 history. Warnings are drafted, rejected and issued through the real `WarningController`, with the
 * gateways scripted per story, so the delivery results (reached, failed, retried) are the ones the rules
 * produce, not numbers typed in. The Sinhala and Tamil texts are drafts, like the base seed's: a native
 * speaker should read them before a demonstration.
 */

const HOUR_MIN = 60;
const DAY_MIN = 24 * HOUR_MIN;
const ROUND_MIN = 6;

const district = (areaId: TargetAreaProps['district'], name: string): TargetAreaProps => ({
  areaId,
  type: 'DISTRICT',
  name,
  district: areaId,
});

interface HistoryWarning {
  warningId: string;
  hazardType: HazardType;
  severity: Severity;
  area: TargetAreaProps;
  messages: Messages;
  submittedBy: 'duty1' | 'duty2';
  /** Minutes before the seed started. */
  draftedAgo: number;
  validForHours: number;
}

const COLOMBO_FLOOD: Messages = {
  EN: 'Flood warning for Colombo: low-lying roads are under water. Avoid flooded roads and stay away from canals until the water falls.',
  SI: 'කොළඹ ගංවතුර අනතුරු ඇඟවීම: පහත්බිම් මාර්ග ජලයෙන් යට වී ඇත. ගංවතුර ඇති මාර්ග මඟහරින්න; ජලය බැස යන තුරු ඇළ මාර්ගවලින් ඈත් වන්න.',
  TA: 'கொழும்பு வெள்ள எச்சரிக்கை: தாழ்வான சாலைகள் நீரில் மூழ்கியுள்ளன. வெள்ளம் நிறைந்த சாலைகளையும் கால்வாய்களையும் நீர் வடியும் வரை தவிர்க்கவும்.',
};

const ISSUED: readonly HistoryWarning[] = [
  {
    warningId: 'warning-hist-colombo-flood',
    hazardType: 'FLOOD',
    severity: 'MEDIUM',
    area: district('COLOMBO', 'Colombo'),
    messages: COLOMBO_FLOOD,
    submittedBy: 'duty1',
    draftedAgo: 6 * DAY_MIN,
    validForHours: 48,
  },
  {
    warningId: 'warning-hist-gampaha-flood',
    hazardType: 'FLOOD',
    severity: 'MEDIUM',
    area: district('GAMPAHA', 'Gampaha'),
    messages: {
      EN: 'Flood warning for Gampaha: the river is rising after heavy rain. Move valuables up and be ready to leave if told to.',
      SI: 'ගම්පහ ගංවතුර අනතුරු ඇඟවීම: අධික වර්ෂාවෙන් පසු ගඟේ ජල මට්ටම ඉහළ යයි. වටිනා භාණ්ඩ උසට ගෙන, නියම කළහොත් පිටවීමට සූදානම් වන්න.',
      TA: 'கம்பஹா வெள்ள எச்சரிக்கை: கனமழையின் பின் ஆற்றின் நீர்மட்டம் உயர்கிறது. பொருட்களை உயரத்தில் வைத்து, வெளியேறச் சொன்னால் தயாராக இருங்கள்.',
    },
    submittedBy: 'duty1',
    draftedAgo: 3 * DAY_MIN,
    validForHours: 36,
  },
  {
    warningId: 'warning-hist-ratnapura-landslide',
    hazardType: 'LANDSLIDE',
    severity: 'HIGH',
    area: district('RATNAPURA', 'Ratnapura'),
    messages: {
      EN: 'Landslide warning for Ratnapura: the slopes are unstable after days of rain. Leave steep areas and follow official instructions.',
      SI: 'රත්නපුර නායයෑමේ අනතුරු ඇඟවීම: දින ගණනක වර්ෂාවෙන් පසු බෑවුම් අස්ථායී ය. බෑවුම් සහිත ප්‍රදේශවලින් ඉවත් වී නිල උපදෙස් පිළිපදින්න.',
      TA: 'இரத்தினபுரி நிலச்சரிவு எச்சரிக்கை: பல நாள் மழைக்குப் பின் சரிவுகள் நிலையற்றுள்ளன. செங்குத்தான பகுதிகளை விட்டு வெளியேறி அறிவுறுத்தல்களைப் பின்பற்றுங்கள்.',
    },
    submittedBy: 'duty1',
    // Yesterday evening, and still in force: the District Officer's screen has an active warning to show.
    draftedAgo: 22 * HOUR_MIN,
    validForHours: 48,
  },
];

const REJECTED: readonly (HistoryWarning & { reason: string; rejectedAfterMin: number })[] = [
  {
    warningId: 'warning-rej-kalutara-landslide',
    hazardType: 'LANDSLIDE',
    severity: 'LOW',
    area: district('KALUTARA', 'Kalutara'),
    messages: {
      EN: 'Landslide watch for Kalutara: small cracks reported on one slope. Stay alert and avoid the slope.',
      SI: 'කළුතර නායයෑම් ඇස්තමේන්තුව: එක් බෑවුමක කුඩා ඉරිතැලීම් වාර්තා වී ඇත. අවදියෙන් සිට එම බෑවුම මඟහරින්න.',
      TA: 'களுத்துறை நிலச்சரிவு கண்காணிப்பு: ஒரு சரிவில் சிறிய விரிசல்கள் பதிவாகியுள்ளன. விழிப்புடன் இருந்து அந்தச் சரிவைத் தவிர்க்கவும்.',
    },
    submittedBy: 'duty2',
    draftedAgo: 4 * DAY_MIN,
    validForHours: 24,
    reason:
      'The slope sensors and the river gauge are normal, so there is not enough evidence for a public warning. The district officer will keep watching.',
    rejectedAfterMin: 95,
  },
  {
    warningId: 'warning-rej-colombo-flood-duplicate',
    hazardType: 'FLOOD',
    severity: 'HIGH',
    area: district('COLOMBO', 'Colombo'),
    messages: COLOMBO_FLOOD,
    submittedBy: 'duty1',
    draftedAgo: 6 * DAY_MIN - 12,
    validForHours: 48,
    reason: 'Duplicate: the Colombo flood warning issued earlier today already covers this area.',
    rejectedAfterMin: 45,
  },
];

const KEGALLE_LANDSLIDE: Pick<Messages, 'SI' | 'TA'> = {
  SI: 'කෑගල්ල නායයෑමේ අනතුරු ඇඟවීම: බෑවුම් අස්ථායී ය. බෑවුම් සහිත මාර්ග මඟහරින්න; ඉරිතැලීම් දුටුවහොත් වහාම ඉවත් වන්න.',
  TA: 'கேகாலை நிலச்சரிவு எச்சரிக்கை: சரிவுகள் நிலையற்றுள்ளன. செங்குத்தான சாலைகளைத் தவிர்க்கவும்; விரிசல்கள் தெரிந்தால் உடனே வெளியேறுங்கள்.',
};

/** The Kegalle story: the cluster draft, the officer who completes it, and the three requests it makes redundant. */
const KEGALLE_STORY = {
  redundantReason: 'The Kegalle cluster warning covers this report; no separate warning is needed.',
  rejectedAgo: 1775,
  editedAgo: 1760,
  issuedAgo: 1750,
  validForHours: 72,
};

/** The Colombo story: its draft is still waiting, and the three single-report requests were set aside. */
const COLOMBO_STORY = {
  redundantReason:
    'The Colombo flood draft already covers this report; no separate warning is needed.',
  rejectedAgo: 12,
  /** The verified reports that each made a request: positions in the cluster's list of reports. */
  verifiedReports: [1, 2, 3],
};

export interface IssuedSummary {
  warningId: string;
  targeted: number;
  reached: number;
  failed: number;
  pendingRetry: number;
}

export interface WarningHistory {
  issued: IssuedSummary[];
  rejected: number;
  /** Requests that came from UC-3 and are still waiting in Pending Approvals. */
  waitingFromReports: number;
}

function newWarning(world: DemoWorld, spec: HistoryWarning): Warning {
  const submitter: Actor = world.actors[spec.submittedBy];
  const draftedAt = world.travelTo(spec.draftedAgo);
  return Warning.create(
    {
      warningId: spec.warningId,
      hazardType: spec.hazardType,
      severity: spec.severity,
      messages: spec.messages,
      targetAreas: [new TargetArea(spec.area)],
      validFrom: draftedAt,
      validTo: new Date(draftedAt.getTime() + spec.validForHours * HOUR_MIN * 60_000),
      submittedBy: submitter.user.userId,
      submittedByName: submitter.user.displayName,
    },
    draftedAt,
  );
}

/** Run the automatic retries the way the API's timer would, round after round, until nothing is due. */
async function runRetryRounds(world: DemoWorld, rounds: number): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    world.clock.advance(ROUND_MIN * 60_000);
    await world.warnings.controller.retryDue();
  }
}

async function summarize(world: DemoWorld, warningId: string): Promise<IssuedSummary> {
  const { result } = await world.warnings.controller.getDelivery(warningId);
  return {
    warningId,
    targeted: result.targeted,
    reached: result.reached,
    failed: result.failed,
    pendingRetry: result.pendingRetry,
  };
}

const failsForSome = (): typeof ALL_WORKING => ({
  down: new Set<Channel>(),
  // A third of the phones never take the push; one SMS in nine is refused for good, so some get nothing.
  failsFor: (channel, citizenId) =>
    failingEvery(3, ['PUSH'])(channel, citizenId) || failingEvery(9, ['SMS'])(channel, citizenId),
});

async function issueEverythingWorked(world: DemoWorld, spec: HistoryWarning): Promise<void> {
  const officer = world.actors.dmc1.user.userId;
  await world.warnings.repository.insert(newWarning(world, spec));
  world.travelTo(spec.draftedAgo - 25);
  // Every channel is ticked, so WhatsApp and e-mail reach the citizens who opted in.
  await world.warnings.controller.issueWarning(spec.warningId, officer, {
    optionalChannels: ['WHATSAPP', 'EMAIL'],
  });
}

async function issueWithFailures(world: DemoWorld, spec: HistoryWarning): Promise<void> {
  const officer = world.actors.dmc2.user.userId;
  await world.warnings.repository.insert(newWarning(world, spec));
  world.travelTo(spec.draftedAgo - 30);
  world.gateways.plan = failsForSome();
  await world.warnings.controller.issueWarning(spec.warningId, officer, { optionalChannels: [] });
  // Three automatic retries per channel, all refused again: what is left is the officer's to follow up.
  await runRetryRounds(world, 4);
  world.gateways.plan = ALL_WORKING;
}

async function issueDuringOutage(world: DemoWorld, spec: HistoryWarning): Promise<void> {
  const officer = world.actors.dmc1.user.userId;
  await world.warnings.repository.insert(newWarning(world, spec));
  world.travelTo(spec.draftedAgo - 20);
  world.gateways.plan = { down: new Set(CHANNELS), failsFor: () => false };
  await world.warnings.controller.issueWarning(spec.warningId, officer, { optionalChannels: [] });
  // The gateways came back almost an hour later; the timer then sent everything that had waited.
  world.gateways.plan = ALL_WORKING;
  world.clock.advance(50 * 60_000);
  await world.warnings.controller.retryDue();
}

async function rejectDrafts(world: DemoWorld): Promise<void> {
  for (const spec of REJECTED) {
    await world.warnings.repository.insert(newWarning(world, spec));
    world.travelTo(spec.draftedAgo - spec.rejectedAfterMin);
    await world.warnings.controller.rejectWarning(
      spec.warningId,
      world.actors.dmc2.user.userId,
      spec.reason,
    );
  }
}

/** Single-report requests that a cluster's warning makes redundant are set aside with a reason. */
async function setAsideLinkedRequests(
  world: DemoWorld,
  reportIds: readonly string[],
  ago: number,
  reason: string,
): Promise<void> {
  world.travelTo(ago);
  for (const reportId of reportIds) {
    await world.warnings.controller.rejectWarning(
      `report-${reportId}`,
      world.actors.dmc2.user.userId,
      reason,
    );
  }
}

/**
 * UC-3 -> UC-1 in full: the escalated Kegalle cluster became a draft; a DMC Officer wrote the Sinhala and
 * Tamil text, lengthened the validity, and issued it; the three single-report requests it replaced were
 * rejected with a reason.
 */
async function issueKegalleCluster(world: DemoWorld, hazards: HazardHistory): Promise<string> {
  const story = hazards.stories['kegalle-landslide'];
  const draft = story && (await world.warnings.repository.findBySourceCluster(story.clusterId));
  if (!story || !draft) throw new Error('The Kegalle cluster did not produce a draft warning.');
  const officer = world.actors.dmc2.user.userId;
  await setAsideLinkedRequests(
    world,
    story.reportIds.slice(0, 3),
    KEGALLE_STORY.rejectedAgo,
    KEGALLE_STORY.redundantReason,
  );
  const editedAt = world.travelTo(KEGALLE_STORY.editedAgo);
  await world.warnings.controller.updateWarning(
    draft.warningId,
    officer,
    {
      messages: KEGALLE_LANDSLIDE,
      validFrom: editedAt,
      validTo: new Date(editedAt.getTime() + KEGALLE_STORY.validForHours * HOUR_MIN * 60_000),
    },
    draft.version,
  );
  world.travelTo(KEGALLE_STORY.issuedAgo);
  await world.warnings.controller.issueWarning(draft.warningId, officer, { optionalChannels: [] });
  return draft.warningId;
}

/** The Colombo cluster's draft is left pending, as an officer would find it; only its redundant requests go. */
async function setAsideColomboRequests(world: DemoWorld, hazards: HazardHistory): Promise<void> {
  const story = hazards.stories['colombo-flood'];
  if (!story) throw new Error('The Colombo cluster story is missing.');
  await setAsideLinkedRequests(
    world,
    COLOMBO_STORY.verifiedReports.map((position) => story.reportIds[position] as string),
    COLOMBO_STORY.rejectedAgo,
    COLOMBO_STORY.redundantReason,
  );
}

export async function seedWarningHistory(
  world: DemoWorld,
  hazards: HazardHistory,
): Promise<WarningHistory> {
  const [everythingWorked, withFailures, outage] = ISSUED;
  await issueEverythingWorked(world, everythingWorked);
  await issueWithFailures(world, withFailures);
  await issueDuringOutage(world, outage);
  const kegalle = await issueKegalleCluster(world, hazards);
  await setAsideColomboRequests(world, hazards);
  await rejectDrafts(world);
  world.gateways.plan = ALL_WORKING;

  const ids = [...ISSUED.map((spec) => spec.warningId), kegalle];
  const pending = await world.warnings.repository.findByStatus('PENDING_APPROVAL');
  return {
    issued: await Promise.all(ids.map((id) => summarize(world, id))),
    rejected: (await world.warnings.repository.findByStatus('REJECTED')).length,
    waitingFromReports: pending.filter((warning) => warning.warningId.startsWith('report-')).length,
  };
}
