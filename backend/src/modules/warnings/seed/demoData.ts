import { DEMO_RIVER_BASINS } from '@shared/auth/seed/demoAccounts';
import type { District, HazardType, Language, Severity } from '@shared/contracts/enums';
import { DISTRICT_CENTROIDS } from '@shared/geo/districts';
import type { GeoPoint } from '@shared/geo/GeoPoint';
import type { TargetAreaProps } from '../domain/TargetArea';
import type { Messages } from '../domain/types';

/** How many demo citizens live in each of the five demo districts (200 in all). */
export const CITIZENS_PER_DISTRICT: Partial<Record<District, number>> = {
  GAMPAHA: 60,
  COLOMBO: 50,
  RATNAPURA: 30,
  KALUTARA: 30,
  KEGALLE: 30,
};

export interface DemoCitizen {
  userId: string;
  nic: string;
  fullName: string;
  /** As typed: the seed normalises it. */
  phone: string;
  addressLine: string;
  district: District;
  homeLocation: GeoPoint;
  preferredLanguage: Language;
  deviceToken?: string;
  whatsappOptIn: boolean;
  emailOptIn: boolean;
  email?: string;
}

const LANGUAGE_CYCLE: Language[] = ['SI', 'TA', 'EN'];

/**
 * A structurally valid 12-digit NIC that is different for every index: year, day of year (plus 500 for
 * every third citizen, who is recorded as a woman), a serial and a check digit. Fictional.
 */
export function demoNic(index: number): string {
  const year = 1970 + (index % 30);
  const day = 1 + ((index * 17) % 365);
  const recordedDay = index % 3 === 0 ? day + 500 : day;
  const serial = String(1000 + index).padStart(4, '0');
  return `${year}${String(recordedDay).padStart(3, '0')}${serial}${index % 10}`;
}

/** A Sri Lankan mobile number for each index: 0771500001, 0771500002, ... Fictional. */
export const demoPhone = (index: number): string => `07715${String(index + 1).padStart(5, '0')}`;

/** About 6 km of spread around the district centre, the same every time. */
function spreadAround(centre: GeoPoint, index: number): GeoPoint {
  const offset = (step: number): number => (((index * step) % 21) - 10) * 0.006;
  return { lat: centre.lat + offset(37), lng: centre.lng + offset(53) };
}

const titleCase = (district: District): string =>
  district.charAt(0) + district.slice(1).toLowerCase();

/**
 * The 200 demo citizens. A mix on purpose, so channel selection has something to choose between: about
 * 7 in 10 have a device token, 3 in 10 opted in to WhatsApp, 1 in 7 to e-mail; every language appears.
 */
export function demoCitizens(): DemoCitizen[] {
  const citizens: DemoCitizen[] = [];
  for (const [district, count] of Object.entries(CITIZENS_PER_DISTRICT) as [District, number][]) {
    for (let n = 1; n <= count; n += 1) {
      const index = citizens.length;
      const withEmail = index % 7 === 0;
      citizens.push({
        userId: `usr-uc1-citizen-${String(index + 1).padStart(3, '0')}`,
        nic: demoNic(index),
        fullName: `Demo Citizen ${titleCase(district)} ${String(n).padStart(3, '0')}`,
        phone: demoPhone(index),
        addressLine: `${n} Demo Road, ${titleCase(district)}`,
        district,
        homeLocation: spreadAround(DISTRICT_CENTROIDS[district], index),
        preferredLanguage: LANGUAGE_CYCLE[index % LANGUAGE_CYCLE.length] as Language,
        ...(index % 10 < 7 ? { deviceToken: `demo-device-token-uc1-${index + 1}` } : {}),
        whatsappOptIn: index % 10 < 3,
        emailOptIn: withEmail,
        ...(withEmail ? { email: `demo.citizen.${index + 1}@example.test` } : {}),
      });
    }
  }
  return citizens;
}

export interface DemoWarning {
  warningId: string;
  hazardType: HazardType;
  severity: Severity;
  area: TargetAreaProps;
  /** Who submitted it. One is a DMC Officer, so the four-eyes rule (BR2) can be demonstrated. */
  submittedBy: string;
  messages: Messages;
}

/** A basin's ring as the domain wants it: `{ lat, lng }` points, without the repeated closing point. */
function basinRing(basinId: string): GeoPoint[] {
  const basin = DEMO_RIVER_BASINS.find((candidate) => candidate._id === basinId);
  const ring = (basin?.boundary.coordinates[0] ?? []).slice(0, -1);
  return ring.map(([lng, lat]) => ({ lat: lat as number, lng: lng as number }));
}

const district = (name: District, label: string): TargetAreaProps => ({
  areaId: name,
  type: 'DISTRICT',
  name: label,
  district: name,
});

/**
 * The five rows of the Pending Approvals wireframe: Gampaha, Ratnapura, Kalutara, Colombo, Kegalle.
 * Two of them target a river basin. The Sinhala and Tamil texts are drafts and need a native speaker's check.
 */
export const DEMO_WARNINGS: readonly DemoWarning[] = [
  {
    warningId: 'warning-demo-gampaha',
    hazardType: 'FLOOD',
    severity: 'HIGH',
    area: district('GAMPAHA', 'Gampaha'),
    submittedBy: 'usr-duty-1',
    messages: {
      EN: 'Flood warning for Gampaha: heavy rain is raising river levels. Move to higher ground now and follow official instructions.',
      SI: 'ගම්පහ ගංවතුර අනතුරු ඇඟවීම: අධික වර්ෂාව නිසා ගංගාවල ජල මට්ටම ඉහළ යයි. දැන්ම උස් බිම්වලට ගොස් නිල උපදෙස් පිළිපදින්න.',
      TA: 'கம்பஹா வெள்ள எச்சரிக்கை: கனமழையால் ஆறுகளின் நீர்மட்டம் உயர்கிறது. உடனே உயரமான இடங்களுக்குச் சென்று அதிகாரப்பூர்வ அறிவுறுத்தல்களைப் பின்பற்றுங்கள்.',
    },
  },
  {
    warningId: 'warning-demo-ratnapura',
    hazardType: 'LANDSLIDE',
    severity: 'CRITICAL',
    area: district('RATNAPURA', 'Ratnapura'),
    submittedBy: 'usr-duty-1',
    messages: {
      EN: 'Landslide warning for Ratnapura: slopes are unstable after days of rain. Leave steep areas now and follow official instructions.',
      SI: 'රත්නපුර නායයෑමේ අනතුරු ඇඟවීම: දින කිහිපයක වර්ෂාවෙන් පසු බෑවුම් අස්ථායී ය. බෑවුම් සහිත ප්‍රදේශවලින් දැන්ම ඉවත් වී නිල උපදෙස් පිළිපදින්න.',
      TA: 'இரத்தினபுரி நிலச்சரிவு எச்சரிக்கை: பல நாட்கள் பெய்த மழையால் சரிவுகள் நிலையற்றுள்ளன. செங்குத்தான பகுதிகளை உடனே விட்டு வெளியேறி அறிவுறுத்தல்களைப் பின்பற்றுங்கள்.',
    },
  },
  {
    warningId: 'warning-demo-kalutara',
    hazardType: 'FLOOD',
    severity: 'MEDIUM',
    area: {
      areaId: 'basin-kalu',
      type: 'RIVER_BASIN',
      name: 'Kalu Ganga basin',
      district: 'KALUTARA',
      boundary: basinRing('basin-kalu'),
    },
    submittedBy: 'usr-dmc-1',
    messages: {
      EN: 'Flood warning for the Kalu Ganga basin: the river is expected to overflow tonight. Move family and valuables to higher ground.',
      SI: 'කළු ගඟ ද්‍රෝණියේ ගංවතුර අනතුරු ඇඟවීම: අද රාත්‍රියේ ගඟ පිටාර ගලනු ඇතැයි අපේක්ෂා කෙරේ. පවුලත් වටිනා භාණ්ඩත් උස් බිමකට ගෙන යන්න.',
      TA: 'களு கங்கை வடிநில வெள்ள எச்சரிக்கை: இன்றிரவு ஆறு கரைபுரண்டு ஓடும் என எதிர்பார்க்கப்படுகிறது. குடும்பத்தையும் பொருட்களையும் உயரமான இடத்திற்கு கொண்டு செல்லுங்கள்.',
    },
  },
  {
    warningId: 'warning-demo-colombo',
    hazardType: 'FLOOD',
    severity: 'HIGH',
    area: {
      areaId: 'basin-kelani',
      type: 'RIVER_BASIN',
      name: 'Kelani Ganga basin',
      district: 'COLOMBO',
      boundary: basinRing('basin-kelani'),
    },
    submittedBy: 'usr-duty-1',
    messages: {
      EN: 'Flood warning for the Kelani Ganga basin: the river is rising fast. Move away from the river banks and follow official instructions.',
      SI: 'කැලණි ගඟ ද්‍රෝණියේ ගංවතුර අනතුරු ඇඟවීම: ගඟේ ජල මට්ටම වේගයෙන් ඉහළ යයි. ගං ඉවුරුවලින් ඈත් වී නිල උපදෙස් පිළිපදින්න.',
      TA: 'களனி கங்கை வடிநில வெள்ள எச்சரிக்கை: ஆற்றின் நீர்மட்டம் வேகமாக உயர்கிறது. ஆற்றங்கரைகளிலிருந்து விலகி அறிவுறுத்தல்களைப் பின்பற்றுங்கள்.',
    },
  },
  {
    warningId: 'warning-demo-kegalle',
    hazardType: 'LANDSLIDE',
    severity: 'HIGH',
    area: district('KEGALLE', 'Kegalle'),
    submittedBy: 'usr-duty-1',
    messages: {
      EN: 'Landslide warning for Kegalle: slopes are saturated. Avoid steep roads and cuttings, and leave at once if you see cracks or hear rumbling.',
      SI: 'කෑගල්ල නායයෑමේ අනතුරු ඇඟවීම: බෑවුම් ජලයෙන් පිරී ඇත. බෑවුම් සහිත මාර්ග වළක්වා ගන්න; ඉරිතැලීම් දුටුවහොත් හෝ ගොරවන හඬක් ඇසුණහොත් වහාම ඉවත් වන්න.',
      TA: 'கேகாலை நிலச்சரிவு எச்சரிக்கை: சரிவுகள் நீரில் ஊறியுள்ளன. செங்குத்தான சாலைகளைத் தவிர்க்கவும்; விரிசல்கள் அல்லது முழக்கம் கேட்டால் உடனே வெளியேறுங்கள்.',
    },
  },
];

/** The demo warnings stay valid this long, so a database seeded days before the viva is still usable. */
export const DEMO_VALIDITY_DAYS = 30;
