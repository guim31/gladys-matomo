// -----------------------------------------------------------------------------
// The Matomo client against the real answers of Matomo 5.14.2
// (test/fixtures/matomo), the fake Matomo against the same answers, errors,
// secrets, and the configuration (address, token).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ERROR_KINDS,
  MatomoClient,
  MatomoError,
  count,
  errorKind,
  normalizeWebsite,
  percent,
} from '../src/matomo/client.js';
import { isCloud, missingCredentials, normalizeConfig, parseServerUrl } from '../src/config.js';
import { BASE, FakeMatomo, TOKEN } from './helpers/fakeMatomo.js';

const real = JSON.parse(
  await readFile(new URL('./fixtures/matomo/v5.14.2.json', import.meta.url), 'utf8'),
);

/** Answers every request from the fixture, by API method; records the requests. */
function replay(answers = real) {
  const requests = [];
  const request = async (url, options) => {
    requests.push({ url, ...options });
    const params = new URLSearchParams(options.body);
    const method = params.get('method');
    const body = {
      'API.getMatomoVersion': answers.version,
      'SitesManager.getSitesWithAtLeastViewAccess': answers.sites,
      'API.getBulkRequest': answers.bulk,
    }[method];
    return { status: 200, body: JSON.stringify(body) };
  };
  return { request, requests };
}

const client = (request, url = BASE, token = TOKEN) => new MatomoClient({ url, token, request });

test('reads the real answers of Matomo 5.14.2', async () => {
  const { request, requests } = replay();
  const matomo = client(request);
  assert.equal(await matomo.version(), '5.14.2');
  assert.deepEqual(await matomo.websites(), [
    { id: '1', name: 'Test blog', domain: 'blog.example.org', timezone: 'Europe/Paris' },
    { id: '2', name: 'Shop', domain: 'shop.example.org', timezone: 'UTC' },
  ]);
  const figures = await matomo.figures(['1', '2'], new Set(['1', '2']));
  assert.deepEqual(figures.get('1'), {
    missing: false,
    calls: { live: null, summary: null, actions: null, goals: null, last: null },
    active: 3,
    today: { visitors: 3, visits: 3, bounceRate: 0 },
    pageviews: 9,
    conversions: 3,
    lastActionAt: 1792778592000,
  });
  assert.equal(figures.get('2').lastActionAt, 0, 'never visited');
  assert.equal(figures.get('2').visits, undefined);
  assert.equal(figures.get('2').today.visits, 0);

  // Always POST to index.php, the token in the body, never in the URL.
  for (const { url, method, body } of requests) {
    assert.equal(url, `${BASE}/index.php`);
    assert.equal(method, 'POST');
    assert.equal(new URLSearchParams(body).get('token_auth'), TOKEN);
  }
  const bulk = new URLSearchParams(requests.at(-1).body);
  assert.equal(
    bulk.get('urls[0]'),
    'method=Live.getCounters&idSite=1&lastMinutes=30',
    'visitors of the last 30 minutes',
  );
  assert.equal(bulk.get('urls[1]'), 'method=VisitsSummary.get&idSite=1&period=day&date=today');
});

test('the fake Matomo answers like the real one', async () => {
  const fake = new FakeMatomo({
    websites: [
      {
        idsite: 1,
        name: 'Test blog',
        main_url: 'https://blog.example.org',
        timezone: 'Europe/Paris',
        active: 3,
        visitors: 3,
        visits: 3,
        pageviews: 9,
        conversions: 3,
        bounceRate: 0,
        lastAction: 1792778592,
      },
    ],
  });
  const matomo = client(fake.request);
  const [site] = await matomo.websites();
  assert.deepEqual(site, (await client(replay().request).websites())[0]);
  const fromFake = (await matomo.figures(['1'], new Set(['1']))).get('1');
  const fromReal = (await client(replay().request).figures(['1', '2'], new Set(['1', '2']))).get(
    '1',
  );
  assert.deepEqual(fromFake, fromReal);
  // The same keys as the real answers, for what the client reads.
  const keys = (value) => Object.keys(Array.isArray(value) ? value[0] : value);
  const bulk = JSON.parse(
    (
      await fake.request(`${BASE}/index.php`, {
        method: 'POST',
        body: new URLSearchParams({
          module: 'API',
          method: 'API.getBulkRequest',
          token_auth: TOKEN,
          'urls[0]': 'method=Live.getCounters&idSite=1&lastMinutes=30',
          'urls[1]': 'method=VisitsSummary.get&idSite=1&period=day&date=today',
          'urls[2]': 'method=Actions.get&idSite=1&period=day&date=today',
          'urls[3]': 'method=Goals.get&idSite=1&period=day&date=today',
        }).toString(),
      })
    ).body,
  );
  bulk.forEach((answer, index) => {
    for (const key of keys(answer)) {
      assert.ok(keys(real.bulk[index]).includes(key), `${key} exists in the real answer`);
    }
  });
});

test('a refused token, and a website the token cannot see (real messages)', async () => {
  const refused = client(async () => ({ status: 200, body: JSON.stringify(real.badToken) }));
  await assert.rejects(refused.websites(), { kind: ERROR_KINDS.AUTH });

  const hidden = client(async () => ({
    status: 200,
    body: JSON.stringify(Array.from({ length: 4 }, () => real.noAccess)),
  }));
  const figures = await hidden.figures(['2']);
  assert.equal(figures.get('2').missing, true);
  assert.equal(errorKind(real.noAccess.message), ERROR_KINDS.API, 'outside a website call');
});

test('a call failing alone leaves its figure empty', async () => {
  const answers = structuredClone(real.bulk.slice(0, 4));
  answers[3] = { result: 'error', message: 'The plugin Goals is not enabled.' };
  const matomo = client(async () => ({ status: 200, body: JSON.stringify(answers) }));
  const figure = (await matomo.figures(['1'])).get('1');
  assert.equal(figure.missing, false);
  assert.equal(figure.conversions, null);
  assert.equal(figure.pageviews, 9);
  assert.equal(figure.calls.goals, 'Matomo: The plugin Goals is not enabled.');
  assert.equal(figure.calls.summary, null);
  assert.equal('last' in figure.calls, false, 'not asked');
  assert.equal(figure.lastActionAt, undefined, 'not asked');
});

test('the visits log deactivated is not a website gone', async () => {
  const answers = structuredClone(real.bulk.slice(0, 5));
  answers[4] = {
    result: 'error',
    message:
      'Visits log is deactivated globally. A user with super user access can enable this feature in the general settings.',
  };
  const matomo = client(async () => ({ status: 200, body: JSON.stringify(answers) }));
  const figure = (await matomo.figures(['1'], new Set(['1']))).get('1');
  assert.equal(figure.missing, false);
  assert.equal(figure.lastActionAt, null);
  assert.equal(figure.visitors ?? figure.today.visitors, 3);
  assert.equal(
    errorKind('SQLSTATE[42000]: Syntax error or access violation', { website: true }),
    ERROR_KINDS.API,
  );
});

test('the day of the figures is sent explicitly when given', async () => {
  const { request, requests } = replay();
  await client(request).figures(['1', '2'], new Set(['1', '2']), new Map([['1', '2026-10-16']]));
  const bulk = new URLSearchParams(requests.at(-1).body);
  assert.equal(bulk.get('urls[1]'), 'method=VisitsSummary.get&idSite=1&period=day&date=2026-10-16');
  assert.equal(bulk.get('urls[6]'), 'method=VisitsSummary.get&idSite=2&period=day&date=today');
});

test('a bulk answer of the wrong length is not trusted', async () => {
  const matomo = client(async () => ({ status: 200, body: '[]' }));
  await assert.rejects(matomo.figures(['1']), { kind: ERROR_KINDS.NOT_MATOMO });
});

test('errors: down, certificate, 401, 429, redirect, 404, HTML, 500', async () => {
  const failing = (error) =>
    client(async () => {
      throw error;
    });
  await assert.rejects(
    failing(
      Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
    ).version(),
    { kind: ERROR_KINDS.UNREACHABLE },
  );
  await assert.rejects(
    failing(
      Object.assign(new Error('fetch failed'), { cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } }),
    ).version(),
    { kind: ERROR_KINDS.TLS },
  );
  const answering = (status, body = '') => client(async () => ({ status, body }));
  await assert.rejects(answering(401).version(), { kind: ERROR_KINDS.AUTH });
  await assert.rejects(answering(429).version(), { kind: ERROR_KINDS.RATE_LIMIT });
  await assert.rejects(answering(301).version(), { kind: ERROR_KINDS.REDIRECT });
  await assert.rejects(answering(404).version(), { kind: ERROR_KINDS.NOT_MATOMO });
  await assert.rejects(answering(200, '<html></html>').version(), {
    kind: ERROR_KINDS.NOT_MATOMO,
  });
  await assert.rejects(answering(500).version(), { kind: ERROR_KINDS.HTTP });
  await assert.rejects(answering(200, '{"result":"error","message":"Mysql error"}').version(), {
    kind: ERROR_KINDS.API,
  });
});

test('no token in the error messages, even when Matomo echoes it', async () => {
  const echo = client(async () => ({
    status: 200,
    body: JSON.stringify({ result: 'error', message: `Token ${TOKEN} is not valid` }),
  }));
  const err = await echo.version().catch((e) => e);
  assert.ok(err instanceof MatomoError);
  assert.ok(!err.message.includes(TOKEN));
});

test('counts, percentages and websites are normalized', () => {
  assert.equal(count('12'), 12);
  assert.equal(count(-1), 0);
  assert.equal(count(undefined), 0);
  assert.equal(percent('45%'), 45);
  assert.equal(percent('45,6 %'), 46);
  assert.equal(percent('abc'), 0);
  assert.equal(normalizeWebsite({ idsite: 'x' }), null);
  assert.deepEqual(normalizeWebsite({ idsite: '7', main_url: 'not a url' }), {
    id: '7',
    name: '#7',
    domain: '',
    timezone: 'UTC',
  });
});

test('the address: bare host, copied URL, sub-folder, index.php dropped', () => {
  assert.equal(parseServerUrl('192.0.2.10:8080'), 'http://192.0.2.10:8080');
  assert.equal(
    parseServerUrl('https://stats.example.org/index.php?module=CoreHome&action=index'),
    'https://stats.example.org',
  );
  assert.equal(parseServerUrl('https://example.org/matomo/'), 'https://example.org/matomo');
  assert.equal(
    parseServerUrl('https://example.org/matomo/index.php'),
    'https://example.org/matomo',
  );
  assert.equal(parseServerUrl(''), '');
  assert.equal(parseServerUrl('ftp://example.org'), null);
  assert.equal(parseServerUrl('https://user:pass@example.org'), null);
  assert.equal(isCloud('https://example.matomo.cloud'), true);
  assert.equal(isCloud('https://stats.example.org'), false);
});

test('normalized configuration and what is missing to read Matomo', () => {
  const config = normalizeConfig({
    url: 'stats.example.org',
    token: ` ${TOKEN}\n`,
    poll_interval: '300',
    spike_threshold: '25',
    silence_hours: 0,
    language: 'de',
  });
  assert.deepEqual(config, {
    url: 'http://stats.example.org',
    token: TOKEN,
    pollIntervalMs: 300_000,
    spikeThreshold: 25,
    silenceHours: 1,
    language: 'de',
  });
  assert.equal(missingCredentials(config), null);
  assert.equal(missingCredentials(normalizeConfig({})), 'noUrl');
  assert.equal(missingCredentials(normalizeConfig({ url: 'ftp://x' })), 'invalidUrl');
  assert.equal(missingCredentials(normalizeConfig({ url: BASE })), 'noToken');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});
