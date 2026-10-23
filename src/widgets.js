// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `matomo_today`.
//
// The use case: a glance at the wall tablet tells how the day goes on the
// websites — visitors right now, unique visitors, visits, page views and goal
// conversions today — and, for several websites, which one draws the
// visitors.
//
// Every website by default, or the ones chosen in the widget settings
// (devices added to Gladys). The figures are sent as values, not bound to
// device features: the widget works before the devices are added.
//
// Budget (8 components, 2 texts): five tiles, one text when Matomo does not
// answer, one status list of ten rows at most (several websites), a Refresh
// button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from './hub.js';
import { ERROR_TEXT, pick } from './texts.js';

// Action key of the button: permanent once published.
export const ACTIONS = Object.freeze({ REFRESH: 'refresh' });

export const MAX_ROWS = 10;

export const TEXT = {
  pick: {
    en: 'Fill in your Matomo in the configuration of the integration.',
    fr: "Renseignez votre Matomo dans la configuration de l'intégration.",
    de: 'Trage dein Matomo in der Konfiguration der Integration ein.',
    es: 'Indique su Matomo en la configuración de la integración.',
  },
  empty: {
    en: 'No website: give the user of the token view access to one in Matomo.',
    fr: "Aucun site : donnez à l'utilisateur du jeton l'accès en lecture à un site dans Matomo.",
    de: 'Keine Website: Gib dem Benutzer des Tokens in Matomo Lesezugriff auf eine Website.',
    es: 'Ningún sitio: dé al usuario del token acceso de lectura a un sitio en Matomo.',
  },
  active: { en: 'Right now', fr: 'En ce moment', de: 'Gerade jetzt', es: 'Ahora mismo' },
  visitors: { en: 'Visitors', fr: 'Visiteurs', de: 'Besucher', es: 'Visitantes' },
  visits: { en: 'Visits', fr: 'Visites', de: 'Besuche', es: 'Visitas' },
  pageviews: { en: 'Page views', fr: 'Pages vues', de: 'Seitenaufrufe', es: 'Páginas vistas' },
  conversions: { en: 'Goals', fr: 'Objectifs', de: 'Ziele', es: 'Objetivos' },
  now: { en: 'now', fr: 'en ligne', de: 'jetzt', es: 'ahora' },
  more: { en: 'Others', fr: 'Autres', de: 'Weitere', es: 'Otros' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  refreshed: {
    en: 'Matomo read again.',
    fr: 'Matomo relu.',
    de: 'Matomo neu gelesen.',
    es: 'Matomo leído de nuevo.',
  },
};

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: pick(text, language) }],
  };
}

/** The websites the widget shows: the chosen devices, or every website. */
export function selectSites(hub, settings) {
  const chosen = [settings?.websites ?? []].flat().filter((id) => typeof id === 'string' && id);
  if (chosen.length === 0) {
    return [...hub.sites.values()];
  }
  return [...new Set(chosen)].map((id) => hub.find(id)).filter(Boolean);
}

const visitorsOf = (site) => site.visitors ?? 0;

async function get(hub, { settings, language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.pick, language);
  }
  const sites = selectSites(hub, settings).sort(
    (a, b) =>
      visitorsOf(b) - visitorsOf(a) ||
      (b.active ?? 0) - (a.active ?? 0) ||
      a.name.localeCompare(b.name),
  );
  if (sites.length === 0 && !hub.error) {
    return message(TEXT.empty, language);
  }

  const sum = (read) => sites.reduce((total, site) => total + (read(site) ?? 0), 0);
  const active = sum((site) => site.active);
  const conversions = sum((site) => site.conversions);
  const components = [
    {
      type: 'value',
      value: active,
      label: pick(TEXT.active, language),
      icon: 'radio',
      color: active > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: sum(visitorsOf),
      label: pick(TEXT.visitors, language),
      icon: 'users',
      color: WIDGET_COLORS.INFO,
    },
    {
      type: 'value',
      value: sum((site) => site.visits),
      label: pick(TEXT.visits, language),
      icon: 'log-in',
      color: WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: sum((site) => site.pageviews),
      label: pick(TEXT.pageviews, language),
      icon: 'file-text',
      color: WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: conversions,
      label: pick(TEXT.conversions, language),
      icon: 'target',
      color: conversions > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
  ];

  if (hub.error) {
    components.push({
      type: 'text',
      variant: 'body',
      text: pick(ERROR_TEXT[hub.error.kind], language),
    });
  }

  if (sites.length > 1) {
    const shown = sites.length > MAX_ROWS ? sites.slice(0, MAX_ROWS - 1) : sites;
    const now = pick(TEXT.now, language);
    const items = shown.map((site) => ({
      label: fit(site.name, 40),
      value: fit(`${visitorsOf(site)} · ${site.active ?? 0} ${now}`, 40),
      icon: (site.active ?? 0) > 0 ? 'radio' : 'globe',
      color: (site.active ?? 0) > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    }));
    if (sites.length > shown.length) {
      items.push({
        label: pick(TEXT.more, language),
        value: `+${sites.length - shown.length}`,
        icon: 'more-horizontal',
        color: WIDGET_COLORS.NEUTRAL,
      });
    }
    components.push({ type: 'status', items });
  }

  components.push({
    type: 'button',
    label: pick(TEXT.refresh, language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: ACTIONS.REFRESH },
  });

  return { ttl_seconds: 60, components };
}

async function action(hub, { actionKey }) {
  if (actionKey !== ACTIONS.REFRESH) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  await hub.pollNow();
  if (hub.error) {
    return { message: ERROR_TEXT[hub.error.kind] };
  }
  return { message: TEXT.refreshed };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
