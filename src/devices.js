// -----------------------------------------------------------------------------
// Gladys devices, proposed in the Discovery tab (the user adds the websites to
// follow, nothing is created on their behalf): one device per Matomo website,
// identified by its idSite.
//
//   active        counter-sensor/integer   visitors of the last 30 minutes
//   visitors      counter-sensor/integer   unique visitors today
//   visits        counter-sensor/integer   visits today
//   pageviews     counter-sensor/integer   page views today
//   conversions   counter-sensor/integer   goal conversions today
//   bounce_rate   unknown/unknown (%)      visits of one page today, in percent
//
// "Today" is the day of the website in Matomo (its time zone setting): the
// daily counters go back to 0 at its midnight. The core has no percentage
// category: the bounce rate is `unknown/unknown` with the percent unit, as
// guim31/gladys-umami does.
//
// Published with should_poll: false: the integration reads Matomo on its own
// timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const WEBSITE_TYPE = 'website';
export const MODEL = 'Matomo';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ACTIVE: 'active',
  VISITORS: 'visitors',
  VISITS: 'visits',
  PAGEVIEWS: 'pageviews',
  CONVERSIONS: 'conversions',
  BOUNCE_RATE: 'bounce_rate',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.ACTIVE]: 'Visitors right now',
    [FEATURE_KEYS.VISITORS]: 'Unique visitors today',
    [FEATURE_KEYS.VISITS]: 'Visits today',
    [FEATURE_KEYS.PAGEVIEWS]: 'Page views today',
    [FEATURE_KEYS.CONVERSIONS]: 'Goal conversions today',
    [FEATURE_KEYS.BOUNCE_RATE]: 'Bounce rate today',
  },
  fr: {
    [FEATURE_KEYS.ACTIVE]: 'Visiteurs en ce moment',
    [FEATURE_KEYS.VISITORS]: "Visiteurs uniques aujourd'hui",
    [FEATURE_KEYS.VISITS]: "Visites aujourd'hui",
    [FEATURE_KEYS.PAGEVIEWS]: "Pages vues aujourd'hui",
    [FEATURE_KEYS.CONVERSIONS]: "Objectifs atteints aujourd'hui",
    [FEATURE_KEYS.BOUNCE_RATE]: "Taux de rebond aujourd'hui",
  },
  de: {
    [FEATURE_KEYS.ACTIVE]: 'Besucher gerade jetzt',
    [FEATURE_KEYS.VISITORS]: 'Eindeutige Besucher heute',
    [FEATURE_KEYS.VISITS]: 'Besuche heute',
    [FEATURE_KEYS.PAGEVIEWS]: 'Seitenaufrufe heute',
    [FEATURE_KEYS.CONVERSIONS]: 'Zielkonversionen heute',
    [FEATURE_KEYS.BOUNCE_RATE]: 'Absprungrate heute',
  },
  es: {
    [FEATURE_KEYS.ACTIVE]: 'Visitantes ahora mismo',
    [FEATURE_KEYS.VISITORS]: 'Visitantes únicos hoy',
    [FEATURE_KEYS.VISITS]: 'Visitas hoy',
    [FEATURE_KEYS.PAGEVIEWS]: 'Páginas vistas hoy',
    [FEATURE_KEYS.CONVERSIONS]: 'Conversiones de objetivos hoy',
    [FEATURE_KEYS.BOUNCE_RATE]: 'Tasa de rebote hoy',
  },
};

// Display bounds (the core never applies them on write).
export const MAX_ACTIVE = 1_000_000;
export const MAX_DAILY = 1_000_000_000;

export const websiteIds = (gladys, id) => gladys.externalIds(WEBSITE_TYPE, String(id));

/** The idSite of a device external id, null when it is not a website of ours. */
export function parseWebsiteId(gladys, externalId) {
  const prefix = websiteIds(gladys, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const id = externalId.slice(prefix.length);
  return /^[1-9][0-9]{0,9}$/.test(id) ? id : null;
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

const counter = (name, externalId, max) =>
  sensor(
    name,
    externalId,
    DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    { keep_history: true, min: 0, max },
  );

/** The discovery payload of a website. */
export function buildWebsiteDevice(gladys, website, language = 'en') {
  const ids = websiteIds(gladys, website.id);
  const names = NAMES[language] ?? NAMES.en;
  const params = [];
  if (website.domain) {
    params.push({ name: 'DOMAIN', value: website.domain.slice(0, 255) });
  }
  return {
    name: website.name.slice(0, 255),
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params,
    features: [
      counter(names[FEATURE_KEYS.ACTIVE], ids.feature(FEATURE_KEYS.ACTIVE), MAX_ACTIVE),
      counter(names[FEATURE_KEYS.VISITORS], ids.feature(FEATURE_KEYS.VISITORS), MAX_DAILY),
      counter(names[FEATURE_KEYS.VISITS], ids.feature(FEATURE_KEYS.VISITS), MAX_DAILY),
      counter(names[FEATURE_KEYS.PAGEVIEWS], ids.feature(FEATURE_KEYS.PAGEVIEWS), MAX_DAILY),
      counter(names[FEATURE_KEYS.CONVERSIONS], ids.feature(FEATURE_KEYS.CONVERSIONS), MAX_DAILY),
      sensor(
        names[FEATURE_KEYS.BOUNCE_RATE],
        ids.feature(FEATURE_KEYS.BOUNCE_RATE),
        DEVICE_FEATURE_CATEGORIES.UNKNOWN,
        DEVICE_FEATURE_TYPES.UNKNOWN.UNKNOWN,
        { unit: DEVICE_FEATURE_UNITS.PERCENT, keep_history: true, min: 0, max: 100 },
      ),
    ],
  };
}

// Site field per feature (null: not read, or its Matomo call failed).
const FIELDS = [
  [FEATURE_KEYS.ACTIVE, 'active'],
  [FEATURE_KEYS.VISITORS, 'visitors'],
  [FEATURE_KEYS.VISITS, 'visits'],
  [FEATURE_KEYS.PAGEVIEWS, 'pageviews'],
  [FEATURE_KEYS.CONVERSIONS, 'conversions'],
  [FEATURE_KEYS.BOUNCE_RATE, 'bounceRate'],
];

/**
 * The states of a website: `{ device_feature_external_id, state }`, nothing
 * for the values not read.
 */
export function websiteValues(gladys, site) {
  const ids = websiteIds(gladys, site.id);
  return FIELDS.filter(([, field]) => typeof site[field] === 'number').map(([key, field]) => ({
    device_feature_external_id: ids.feature(key),
    state: site[field],
  }));
}
