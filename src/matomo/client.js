// -----------------------------------------------------------------------------
// Matomo client: the Reporting API (`index.php?module=API&format=JSON`), read
// only, always in POST so the token never sits in a URL (and the "secure only"
// tokens of Matomo 5 are accepted). Checked against a real Matomo 5.14.2
// (MariaDB 11) in Docker.
//
//   SitesManager.getSitesWithAtLeastViewAccess   the websites the token sees
//   API.getBulkRequest                           several calls in one request:
//     Live.getCounters (lastMinutes=30)          visitors right now
//     VisitsSummary.get (period=day, today)      visits, unique visitors, bounce rate
//     Actions.get (period=day, today)            page views
//     Goals.get (period=day, today)              goal conversions
//     Live.getLastVisitsDetails (filter_limit=1) time of the last action
//   API.getMatomoVersion                         "Test the connection"
//
// Matomo answers HTTP 200 with `{ result: "error", message }` for an API
// error, a refused token included. "Today" is the day in the time zone of the
// website (Matomo setting), not the one of Gladys.
//
// Redirects are not followed: the token would be sent wherever the address
// points (an http:// address redirected to https:// is reported).
// -----------------------------------------------------------------------------

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // token refused (or a reverse proxy asking for a password)
  RATE_LIMIT: 'rate_limit', // HTTP 429
  NOT_MATOMO: 'not_matomo', // something answers, not the Matomo API
  REDIRECT: 'redirect', // the address redirects (usually HTTP to HTTPS)
  NOT_FOUND: 'not_found', // the website no longer exists or is no longer visible
  API: 'api', // an error of Matomo itself (plugin disabled, database...)
  HTTP: 'http', // any other HTTP error
});

export class MatomoError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'MatomoError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export const MAX_BODY_BYTES = 8 * 1024 * 1024;
// Websites read in one bulk request (five calls each).
export const SITES_PER_BULK = 20;
// Websites followed at most.
export const MAX_SITES = 200;
// Visitors "right now": the last 30 minutes, as the Matomo real-time widget.
export const LIVE_MINUTES = 30;

/**
 * The one function that talks to the network (fetch). The client takes it as
 * a parameter: the tests replace it with an in-memory Matomo
 * (test/helpers/fakeMatomo.js).
 * @returns {Promise<{ status: number, body: string }>}
 */
export async function httpRequest(
  url,
  { method = 'GET', headers = {}, body, timeoutMs = 20_000 } = {},
) {
  const response = await fetch(url, {
    method,
    headers,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw new Error('Response too large');
  }
  return { status: response.status, body: await response.text() };
}

/** A count of the API: a number or a numeric string. 0 when unusable. */
export function count(raw) {
  const number = typeof raw === 'string' ? Number(raw) : raw;
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

/** A percentage of the API ("45%", 45 or "45,5 %"), whole, 0 to 100. */
export function percent(raw) {
  const number = typeof raw === 'string' ? Number(raw.replace('%', '').replace(',', '.')) : raw;
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : 0;
}

/** One website of the list, normalized; null when it cannot be identified. */
export function normalizeWebsite(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const id = Number(raw.idsite);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  let domain;
  try {
    domain = new URL(String(raw.main_url)).host;
  } catch {
    domain = '';
  }
  const name = (typeof raw.name === 'string' && raw.name.trim()) || domain || `#${id}`;
  const timezone = typeof raw.timezone === 'string' ? raw.timezone : 'UTC';
  return { id: String(id), name, domain, timezone };
}

/** An API error object of Matomo, or null. */
const apiError = (data) =>
  data && typeof data === 'object' && !Array.isArray(data) && data.result === 'error'
    ? String(data.message ?? 'Matomo error')
    : null;

// A refused or expired token; anything else about access concerns a website.
const AUTH_MESSAGE = /authenticate|token_auth|token is|session/i;
// The one message of a website gone or no longer visible to the token (other
// "access" messages exist: visits log deactivated, SQL access violation).
const ACCESS_MESSAGE = /requires 'view' access for the website id|website id = \d+ does not exist/i;

/** The kind of an API error message. */
export function errorKind(message, { website = false } = {}) {
  if (AUTH_MESSAGE.test(message)) {
    return ERROR_KINDS.AUTH;
  }
  if (website && ACCESS_MESSAGE.test(message)) {
    return ERROR_KINDS.NOT_FOUND;
  }
  return ERROR_KINDS.API;
}

// Matomo echoes a part of the request in a few messages: the token never
// reaches the logs.
const scrub = (message, token) =>
  (token ? message.split(token).join('***') : message).replace(/\s+/g, ' ').slice(0, 200);

function parse(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export class MatomoClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL of Matomo (where index.php lives)
   * @param {string} options.token token_auth of a user with view access
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, token, request, timeoutMs = 20_000 }) {
    this.endpoint = `${url}/index.php`;
    this.token = token;
    this.request = request ?? httpRequest;
    this.timeoutMs = timeoutMs;
  }

  async send(params) {
    const body = new URLSearchParams({ module: 'API', format: 'JSON', ...params });
    body.append('token_auth', this.token);
    let response;
    try {
      response = await this.request(this.endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      const code = err.cause?.code ?? err.code;
      if (TLS_CODES.has(code)) {
        throw new MatomoError(ERROR_KINDS.TLS, `Certificate refused (${code})`);
      }
      throw new MatomoError(ERROR_KINDS.UNREACHABLE, code ?? err.name ?? err.message);
    }
    const { status } = response;
    if (status === 401 || status === 403) {
      throw new MatomoError(ERROR_KINDS.AUTH, `Access refused (HTTP ${status})`, { status });
    }
    if (status === 429) {
      throw new MatomoError(ERROR_KINDS.RATE_LIMIT, 'Too many requests (HTTP 429)', { status });
    }
    if (status >= 300 && status < 400) {
      throw new MatomoError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status === 404) {
      throw new MatomoError(ERROR_KINDS.NOT_MATOMO, 'No Matomo at this address (HTTP 404)', {
        status,
      });
    }
    if (status < 200 || status >= 300) {
      throw new MatomoError(ERROR_KINDS.HTTP, `Unexpected answer (HTTP ${status})`, { status });
    }
    const data = parse(response.body);
    if (data === null) {
      throw new MatomoError(ERROR_KINDS.NOT_MATOMO, 'The answer is not JSON');
    }
    const error = apiError(data);
    if (error) {
      const message = scrub(error, this.token);
      throw new MatomoError(errorKind(message), `Matomo: ${message}`);
    }
    return data;
  }

  /** The version of Matomo, e.g. "5.14.2". */
  async version() {
    const data = await this.send({ method: 'API.getMatomoVersion' });
    if (typeof data?.value !== 'string') {
      throw new MatomoError(ERROR_KINDS.NOT_MATOMO, 'The answer is not a Matomo version');
    }
    return data.value;
  }

  /**
   * The websites the token sees (view access at least).
   * @returns {Promise<Array<{ id: string, name: string, domain: string, timezone: string }>>}
   */
  async websites() {
    const data = await this.send({ method: 'SitesManager.getSitesWithAtLeastViewAccess' });
    if (!Array.isArray(data)) {
      throw new MatomoError(ERROR_KINDS.NOT_MATOMO, 'The answer is not a Matomo website list');
    }
    return data.map(normalizeWebsite).filter(Boolean).slice(0, MAX_SITES);
  }

  /**
   * Several API calls in one request. Each result is the data, or a
   * MatomoError (a call may fail alone: a plugin disabled, a website gone).
   * @param {Array<Record<string, string>>} calls
   * @returns {Promise<Array<unknown>>}
   */
  async bulk(calls) {
    const params = { method: 'API.getBulkRequest' };
    calls.forEach((call, index) => {
      params[`urls[${index}]`] = new URLSearchParams(call).toString();
    });
    const data = await this.send(params);
    if (!Array.isArray(data) || data.length !== calls.length) {
      throw new MatomoError(ERROR_KINDS.NOT_MATOMO, 'The answer is not a Matomo bulk answer');
    }
    return data.map((item, index) => {
      const error = apiError(item);
      if (!error) {
        return item;
      }
      const message = scrub(error, this.token);
      const website = 'idSite' in calls[index];
      return new MatomoError(errorKind(message, { website }), `Matomo: ${message}`);
    });
  }

  /**
   * The figures of several websites, in bulk requests of SITES_PER_BULK.
   * `lastVisit` lists the websites whose last action time is wanted; `days`
   * gives the day to read per website (`YYYY-MM-DD` in its time zone, the
   * one the caller files the figures under), `today` by default.
   * Each figure is null when its call failed; `missing` is set when Matomo
   * says, for every call, that the website is gone (or no longer visible).
   * @param {string[]} ids
   * @param {Set<string>} [lastVisit]
   * @param {Map<string, string>} [days]
   */
  async figures(ids, lastVisit = new Set(), days = new Map()) {
    const result = new Map();
    for (let at = 0; at < ids.length; at += SITES_PER_BULK) {
      const batch = ids.slice(at, at + SITES_PER_BULK);
      const calls = [];
      for (const id of batch) {
        const day = { idSite: id, period: 'day', date: days.get(id) ?? 'today' };
        calls.push(
          { method: 'Live.getCounters', idSite: id, lastMinutes: String(LIVE_MINUTES) },
          { method: 'VisitsSummary.get', ...day },
          { method: 'Actions.get', ...day },
          { method: 'Goals.get', ...day },
        );
        if (lastVisit.has(id)) {
          calls.push({
            method: 'Live.getLastVisitsDetails',
            idSite: id,
            filter_limit: '1',
            doNotFetchActions: '1',
            showColumns: 'lastActionTimestamp',
          });
        }
      }
      const answers = await this.bulk(calls);
      let index = 0;
      for (const id of batch) {
        const take = () => answers[index++];
        const live = take();
        const summary = take();
        const actions = take();
        const goals = take();
        const last = lastVisit.has(id) ? take() : undefined;
        result.set(id, readFigures({ live, summary, actions, goals, last }));
      }
    }
    return result;
  }
}

const isObject = (value) => value && typeof value === 'object' && !(value instanceof Error);

/** The figures of one website from its bulk answers. */
export function readFigures({ live, summary, actions, goals, last }) {
  const asked = { live, summary, actions, goals };
  if (last !== undefined) {
    asked.last = last;
  }
  const answers = Object.values(asked);
  // Per call: the error message, or null when it answered.
  const calls = Object.fromEntries(
    Object.entries(asked).map(([key, answer]) => [
      key,
      answer instanceof MatomoError ? answer.message : null,
    ]),
  );
  const missing = answers.every(
    (answer) => answer instanceof MatomoError && answer.kind === ERROR_KINDS.NOT_FOUND,
  );
  const counters = Array.isArray(live) ? live[0] : null;
  let lastActionAt;
  if (last !== undefined) {
    if (Array.isArray(last)) {
      const time = Number(last[0]?.lastActionTimestamp);
      // No visit at all: 0, "long ago".
      lastActionAt = Number.isFinite(time) && time > 0 ? time * 1000 : 0;
    } else {
      lastActionAt = null;
    }
  }
  return {
    missing,
    calls,
    active: isObject(counters) ? count(counters.visitors) : null,
    today: isObject(summary)
      ? {
          visitors: count(summary.nb_uniq_visitors),
          visits: count(summary.nb_visits),
          bounceRate: percent(summary.bounce_rate),
        }
      : null,
    pageviews: isObject(actions) ? count(actions.nb_pageviews) : null,
    conversions: isObject(goals) ? count(goals.nb_conversions) : null,
    lastActionAt,
  };
}
