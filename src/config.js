// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// A Matomo server (self-hosted or Matomo Cloud): its address and the
// token_auth of a user with view access.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

export const DEFAULT_CONFIG = {
  url: '',
  token: '',
  poll_interval: '60',
  spike_threshold: 10,
  silence_hours: 24,
  language: 'fr',
};

export const MAX_SPIKE_THRESHOLD = 1_000_000;
export const MAX_SILENCE_HOURS = 720;

// The hosts of Matomo Cloud (InnoCraft).
const CLOUD_HOST = /\.(matomo|innocraft)\.cloud$/i;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10:8080`), or a URL copied from the browser
 * (`https://stats.example.org/index.php?module=CoreHome…`). HTTP by default
 * for a bare host. A path is kept (Matomo in a sub-folder), `index.php` and
 * the query dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, '' when empty,
 *   null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  const text = raw.trim();
  if (!text) {
    return '';
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  const path = url.pathname.replace(/\/(index|matomo|piwik)\.php$/i, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Whether the address is a Matomo Cloud one (the badge of the devices). */
export const isCloud = (url) => {
  try {
    return CLOUD_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => (url ? url.replace(/^https?:\/\//, '') : '');

function integer(value, fallback, min, max) {
  const number = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : value;
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const pollInterval = POLL_INTERVALS.includes(String(source.poll_interval))
    ? String(source.poll_interval)
    : DEFAULT_CONFIG.poll_interval;
  return {
    url: parseServerUrl(source.url),
    // A pasted token often carries a space or a new line.
    token: typeof source.token === 'string' ? source.token.trim() : '',
    pollIntervalMs: Number(pollInterval) * 1000,
    spikeThreshold: integer(
      source.spike_threshold,
      DEFAULT_CONFIG.spike_threshold,
      1,
      MAX_SPIKE_THRESHOLD,
    ),
    silenceHours: integer(source.silence_hours, DEFAULT_CONFIG.silence_hours, 1, MAX_SILENCE_HOURS),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

/**
 * What is missing to read Matomo, null when the configuration is complete:
 * 'invalidUrl', 'noUrl' or 'noToken'.
 */
export function missingCredentials(config) {
  if (config.url === null) {
    return 'invalidUrl';
  }
  if (config.url === '') {
    return 'noUrl';
  }
  return config.token ? null : 'noToken';
}
