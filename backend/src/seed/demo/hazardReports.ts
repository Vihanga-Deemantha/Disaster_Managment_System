import type { GeoPoint } from '@shared/geo/GeoPoint';
import type { ReportHazardType } from '../../modules/hazard-reports/domain/types';
import type { ReviewOfficer } from '../../modules/hazard-reports/application/ReportReviewService';
import { VOLUNTEER_IDS } from './accounts';
import { placeholderPhoto } from './photos';
import type { Actor, DemoWorld } from './world';

/**
 * UC-3 history. Citizens and volunteers send reports (with the real submission service, so they are
 * clustered, scored and de-duplicated by the real rules), and Duty and DMC officers review them. Each
 * story ends in a different state, so every screen of UC-3, and its hand-off to UC-1, has something to show.
 */

/** The citizens of the base seed's 200 (`0771500001`...): Gampaha 1-60, Colombo 61-110, Ratnapura 111-140, Kalutara 141-170, Kegalle 171-200. */
const citizen = (n: number): string => `usr-uc1-citizen-${String(n).padStart(3, '0')}`;
const MOBILE_DEMO_CITIZEN = citizen(1);
const volunteer = (n: number): string => VOLUNTEER_IDS[n] as string;

type Reviewer = 'duty1' | 'duty2' | 'dmc1' | 'dmc2';

interface ReportSpec {
  by: string;
  hazard: ReportHazardType;
  /** Minutes before the seed started that the picture was taken. */
  ago: number;
  text: string;
  photo?: true;
  /** The pin was placed on the map by hand instead of by GPS. */
  manual?: true;
}

interface ReviewSpec {
  /** Position in the story's list of reports (0 is the first one sent). */
  report: number;
  decision: 'verify' | 'reject';
  by: Reviewer;
  /** Minutes before the seed started. */
  ago: number;
  reason?: string;
}

interface Story {
  key: string;
  centre: GeoPoint;
  reports: ReportSpec[];
  reviews: ReviewSpec[];
  /** A phone with no signal: the reports are delivered together at this many minutes ago. */
  deliveredAgo?: number;
  escalate?: { by: Reviewer; ago: number };
}

const TEXT: Record<ReportHazardType, readonly string[]> = {
  LANDSLIDE: [
    'Cracks have opened in the hillside above the road and small stones are rolling down.',
    'Part of the slope has slipped onto the lane. A house is only a few metres away.',
    'Muddy water is running out of the slope and the trees above have started to lean.',
    'Soil has come down across the road and vehicles cannot pass.',
    'A loud rumbling from the hill; the families nearby are leaving their homes.',
    'කන්ද පැත්තේ පස් ඇදී වැටෙමින් පවතී, පාරට උඩින් ඉරිතැලීම් ඇත.',
    'மலைச்சரிவில் விரிசல்கள் தோன்றி கற்கள் உருண்டு விழுகின்றன.',
  ],
  FLOOD: [
    'Floodwater has reached the doorsteps of the houses beside the river.',
    'The road is under knee-deep water and vehicles are turning back.',
    'The water is still rising near the bridge; people are moving belongings upstairs.',
    'The drain has overflowed and the whole lane is flooded.',
    'ගඟ අසල නිවාස අසලට ගංවතුර ළඟා වී ඇත.',
    'ஆற்றின் அருகிலுள்ள வீடுகளின் வாசல் வரை வெள்ளம் வந்துவிட்டது.',
  ],
  ROAD_BLOCKAGE: [
    'A large tree has fallen across the main road and both lanes are blocked.',
    'A fallen electricity pole is lying on the road; please keep people away.',
    'Mud and rocks cover half of the road; only motorbikes can pass.',
    'ප්‍රධාන මාර්ගය හරහා විශාල ගසක් කඩා වැටී ඇත.',
    'பிரதான சாலையின் குறுக்கே பெரிய மரம் விழுந்துள்ளது.',
  ],
  OTHER: [
    'A drain cover has been washed away, a danger for people walking at night.',
    'The culvert under the lane is blocked by branches and water is backing up.',
    'Part of the retaining wall near the school has cracked.',
  ],
};

interface Plan {
  hazard: ReportHazardType;
  by: readonly string[];
  /** Minutes ago of the newest report, and the gap between one report and the next. */
  newestAgo: number;
  gap: number;
  /** Which reports carry a photo, and which have a hand-placed pin. */
  photoEvery?: number;
  manualEvery?: number;
}

/** One report per reporter, oldest first, with the texts taken in turn. */
function reportsFor(plan: Plan): ReportSpec[] {
  const count = plan.by.length;
  return plan.by.map((by, index) => ({
    by,
    hazard: plan.hazard,
    ago: plan.newestAgo + (count - 1 - index) * plan.gap,
    text: TEXT[plan.hazard][index % TEXT[plan.hazard].length] as string,
    ...(plan.photoEvery && index % plan.photoEvery === 0 ? { photo: true as const } : {}),
    ...(plan.manualEvery && index % plan.manualEvery === 1 ? { manual: true as const } : {}),
  }));
}

const range = (from: number, count: number): number[] =>
  Array.from({ length: count }, (_, index) => from + index);

/**
 * The seven stories. The pins sit well away from the base seed's five clusters, so none of these reports
 * joins one of them. Everything that can become a warning is in a district that has registered citizens.
 */
const STORIES: readonly Story[] = [
  {
    // HIGH, three reports verified: the Escalate button is live, and stays so (a landslide cluster of this size never decays below HIGH).
    key: 'ratnapura-landslide',
    centre: { lat: 6.7225, lng: 80.381 },
    reports: reportsFor({
      hazard: 'LANDSLIDE',
      by: [...range(111, 10).map(citizen), volunteer(2), volunteer(0)],
      newestAgo: 35,
      gap: 11,
      photoEvery: 3,
      manualEvery: 6,
    }),
    reviews: [
      { report: 0, decision: 'verify', by: 'duty1', ago: 26 },
      { report: 1, decision: 'verify', by: 'duty1', ago: 24 },
      { report: 2, decision: 'verify', by: 'duty1', ago: 22 },
      {
        report: 7,
        decision: 'reject',
        by: 'duty1',
        ago: 19,
        reason: 'The photo shows an older landslide, not the place that was reported.',
      },
    ],
  },
  {
    // Escalated by a Duty Officer a day and a half ago; UC-1 turns it into the issued warning (see warnings.ts).
    key: 'kegalle-landslide',
    centre: { lat: 7.2533, lng: 80.447 },
    reports: reportsFor({
      hazard: 'LANDSLIDE',
      by: [...range(171, 8).map(citizen), volunteer(3), citizen(190)],
      newestAgo: 1860,
      gap: 17,
      photoEvery: 2,
      manualEvery: 5,
    }),
    reviews: [
      { report: 0, decision: 'verify', by: 'duty2', ago: 1830 },
      { report: 1, decision: 'verify', by: 'duty2', ago: 1826 },
      { report: 2, decision: 'verify', by: 'duty2', ago: 1822 },
      {
        report: 8,
        decision: 'reject',
        by: 'duty2',
        ago: 1815,
        reason: 'The same road was already reported by another person a few minutes earlier.',
      },
    ],
    escalate: { by: 'duty2', ago: 1800 },
  },
  {
    // Verified by a Duty Officer and escalated twenty minutes ago: its draft waits in Pending Approvals with no
    // Sinhala or Tamil text yet (see warnings.ts for the three single-report requests it makes redundant).
    key: 'colombo-flood',
    centre: { lat: 6.9333, lng: 79.887 },
    reports: reportsFor({
      hazard: 'FLOOD',
      by: [...range(61, 7).map(citizen), MOBILE_DEMO_CITIZEN],
      newestAgo: 40,
      gap: 9,
      photoEvery: 3,
    }),
    reviews: [
      { report: 1, decision: 'verify', by: 'duty1', ago: 30 },
      { report: 2, decision: 'verify', by: 'duty1', ago: 28 },
      { report: 3, decision: 'verify', by: 'duty1', ago: 26 },
    ],
    escalate: { by: 'duty1', ago: 20 },
  },
  {
    // A road report one officer verified (so it is waiting in Pending Approvals) and one that was a false alarm.
    key: 'colombo-road',
    centre: { lat: 6.873, lng: 79.89 },
    reports: reportsFor({
      hazard: 'ROAD_BLOCKAGE',
      by: [MOBILE_DEMO_CITIZEN, citizen(72), citizen(73), volunteer(1), citizen(75)],
      newestAgo: 75,
      gap: 14,
      photoEvery: 2,
    }),
    reviews: [
      { report: 0, decision: 'verify', by: 'dmc1', ago: 52 },
      {
        report: 4,
        decision: 'reject',
        by: 'dmc1',
        ago: 46,
        reason: 'The road had already been cleared when the council crew arrived.',
      },
    ],
  },
  {
    // A low-priority report of another kind, verified: it too waits in Pending Approvals.
    key: 'kalutara-other',
    centre: { lat: 6.7157, lng: 80.0627 },
    reports: reportsFor({
      hazard: 'OTHER',
      by: [volunteer(4), citizen(141), citizen(142)],
      newestAgo: 100,
      gap: 20,
      photoEvery: 1,
    }),
    reviews: [{ report: 0, decision: 'verify', by: 'duty1', ago: 72 }],
  },
  {
    // Three false alarms: every report rejected with a reason, so the cluster closes. One is the phone demo account's.
    key: 'gampaha-closed',
    centre: { lat: 7.145, lng: 80.098 },
    reports: reportsFor({
      hazard: 'LANDSLIDE',
      by: [MOBILE_DEMO_CITIZEN, citizen(2), citizen(3)],
      newestAgo: 440,
      gap: 10,
      photoEvery: 2,
    }),
    reviews: [
      {
        report: 0,
        decision: 'reject',
        by: 'duty1',
        ago: 400,
        reason: 'The location could not be corroborated: no slope exists at this pin.',
      },
      {
        report: 1,
        decision: 'reject',
        by: 'duty1',
        ago: 396,
        reason: 'The photo is from another place.',
      },
      {
        report: 2,
        decision: 'reject',
        by: 'duty1',
        ago: 392,
        reason: 'No sign of ground movement; the local officer visited and found nothing.',
      },
    ],
  },
  {
    // A walking group with no signal: five reports taken hours ago, delivered together when the phone found coverage.
    key: 'kandy-offline',
    centre: { lat: 7.2906, lng: 80.6333 },
    reports: reportsFor({
      hazard: 'FLOOD',
      by: [volunteer(5), citizen(63), citizen(64), citizen(65), citizen(66)],
      newestAgo: 300,
      gap: 18,
      photoEvery: 2,
      manualEvery: 2,
    }),
    reviews: [],
    deliveredAgo: 25,
  },
];

const METRES_PER_DEGREE = 111_195;
const PIN_RADIUS_M = 450;

/** Reports sit on a ring around the centre, comfortably inside the 2 km clustering radius. */
function pin(centre: GeoPoint, index: number, count: number): GeoPoint {
  const angle = (index * 2 * Math.PI) / count;
  const delta = PIN_RADIUS_M / METRES_PER_DEGREE;
  return {
    lat: centre.lat + delta * Math.sin(angle),
    lng: centre.lng + (delta * Math.cos(angle)) / Math.cos((centre.lat * Math.PI) / 180),
  };
}

export interface StoryRecord {
  clusterId: string;
  reportIds: string[];
}

export interface HazardHistory {
  stories: Record<string, StoryRecord>;
  reports: number;
  photos: number;
  verified: number;
  rejected: number;
  escalated: number;
}

function reviewerOf(world: DemoWorld, who: Reviewer): ReviewOfficer {
  const actor: Actor = world.actors[who];
  return { userId: actor.user.userId, role: actor.user.role as ReviewOfficer['role'] };
}

const isVolunteer = (userId: string): boolean => VOLUNTEER_IDS.includes(userId);

async function sendReports(world: DemoWorld, story: Story, photos: { count: number }) {
  const reportIds: string[] = [];
  let clusterId = '';
  for (const [index, spec] of story.reports.entries()) {
    const capturedAt = new Date(world.startedAt.getTime() - spec.ago * 60_000);
    world.travelTo(story.deliveredAgo ?? spec.ago - 1);
    const photo = spec.photo
      ? { content: placeholderPhoto(spec.hazard, photos.count + 1), mimeType: 'image/png' }
      : undefined;
    if (photo) photos.count += 1;
    const { outcome, report } = await world.hazards.submission.submit({
      reporterId: spec.by,
      reporterRole: isVolunteer(spec.by) ? 'COMMUNITY_VOLUNTEER' : 'CITIZEN',
      clientReportId: `demo-${story.key}-${index + 1}`,
      hazardType: spec.hazard,
      description: spec.text,
      location: {
        ...pin(story.centre, index, story.reports.length),
        source: spec.manual ? 'MANUAL' : 'GPS',
        ...(spec.manual ? {} : { accuracyM: 8 + (index % 5) * 3 }),
      },
      capturedAt,
      ...(photo ? { photo } : {}),
      syncedFromOffline: story.deliveredAgo !== undefined,
    });
    if (outcome !== 'CREATED') {
      throw new Error(`Demo report ${story.key} #${index + 1} was not created (${outcome}).`);
    }
    reportIds.push(report.id);
    clusterId = report.clusterId as string;
  }
  return { clusterId, reportIds };
}

async function reviewReports(world: DemoWorld, story: Story, record: StoryRecord) {
  const counts = { verified: 0, rejected: 0 };
  const ordered = [...story.reviews].sort((a, b) => b.ago - a.ago);
  for (const review of ordered) {
    world.travelTo(review.ago);
    const officer = reviewerOf(world, review.by);
    const reportId = record.reportIds[review.report] as string;
    if (review.decision === 'verify') {
      await world.hazards.review.verify(reportId, officer);
      counts.verified += 1;
    } else {
      await world.hazards.review.reject(reportId, officer, review.reason ?? 'Not confirmed.');
      counts.rejected += 1;
    }
  }
  return counts;
}

export async function seedHazardHistory(world: DemoWorld): Promise<HazardHistory> {
  const history: HazardHistory = {
    stories: {},
    reports: 0,
    photos: 0,
    verified: 0,
    rejected: 0,
    escalated: 0,
  };
  const photos = { count: 0 };
  for (const story of STORIES) {
    const record = await sendReports(world, story, photos);
    history.stories[story.key] = record;
    history.reports += story.reports.length;
    const counts = await reviewReports(world, story, record);
    history.verified += counts.verified;
    history.rejected += counts.rejected;
    if (story.escalate) {
      world.travelTo(story.escalate.ago);
      await world.hazards.review.escalate(record.clusterId, reviewerOf(world, story.escalate.by));
      history.escalated += 1;
    }
  }
  history.photos = photos.count;
  return history;
}

export const STORY_KEYS = STORIES.map((story) => story.key);
