// -----------------------------------------------------------------------------
// The hub against the SDK's fake Gladys and a fake Matomo: discovery, states,
// scene triggers, persistence across restarts, errors, quiet logs, the
// widget, the scene action and the reading timer of the container.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { FEATURE_KEYS } from '../src/devices.js';
import { HUB_TIMINGS, TRIGGERS, WIDGET_KEY, dayIn } from '../src/hub.js';
import {
  BASE,
  FakeMatomo,
  TOKEN,
  createClock,
  createDevices,
  createWorld,
  idsOf,
  website,
} from './helpers/world.js';

const events = (world, key) => world.fake.sceneEvents.filter((event) => event.key === key);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

test('one device per website, proposed in Discovery, nothing polled by Gladys', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => d.name),
    ['Blog', 'Shop'],
  );
  for (const device of devices) {
    assert.equal(device.should_poll, false);
    assert.equal(device.poll_frequency, undefined);
    assert.equal(device.features.length, 6);
  }
  assert.deepEqual(devices[0].params, [{ name: 'DOMAIN', value: 'blog.example.org' }]);
  assert.equal(world.fake.states.length, 0, 'nothing published for devices not added');
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('the states of an added device, at once, then only the changes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const ids = idsOf(world, 'Blog');
  const state = (key) => world.fake.lastState(ids.feature(key));
  assert.equal(state(FEATURE_KEYS.ACTIVE), 2);
  assert.equal(state(FEATURE_KEYS.VISITORS), 12);
  assert.equal(state(FEATURE_KEYS.VISITS), 15);
  assert.equal(state(FEATURE_KEYS.PAGEVIEWS), 41);
  assert.equal(state(FEATURE_KEYS.CONVERSIONS), 1);
  assert.equal(state(FEATURE_KEYS.BOUNCE_RATE), 40);
  assert.deepEqual(
    [...new Set(world.fake.transports.map((entry) => entry.transport))],
    ['local'],
    'a self-hosted server is local',
  );

  const before = world.fake.states.length;
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.equal(world.fake.states.length, before, 'nothing changed, nothing sent');

  world.matomo.get('Blog').active = 5;
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.equal(world.fake.states.length, before + 1);
  assert.equal(state(FEATURE_KEYS.ACTIVE), 5);
});

test('requests: one bulk request per cycle, the website list every 10 minutes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.matomo.requests = [];
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.deepEqual(world.matomo.requests, ['API.getBulkRequest']);
  world.matomo.requests = [];
  world.clock.advance(10 * MINUTE);
  await world.hub.pollNow();
  assert.deepEqual(world.matomo.requests, [
    'SitesManager.getSitesWithAtLeastViewAccess',
    'API.getBulkRequest',
  ]);
});

test('25 websites are read in two bulk requests', async (t) => {
  const websites = Array.from({ length: 25 }, () => website());
  const world = await createWorld({ matomo: new FakeMatomo({ websites }) });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 25);
  world.matomo.requests = [];
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.deepEqual(world.matomo.requests, ['API.getBulkRequest', 'API.getBulkRequest']);
  assert.equal(world.hub.sites.get(String(websites[24].idsite)).visits, 0);
});

test('the day of a website is the one of its time zone in Matomo', () => {
  const time = Date.UTC(2026, 9, 15, 22, 30); // 00:30 in Paris
  assert.equal(dayIn(time, 'Europe/Paris'), '2026-10-16');
  assert.equal(dayIn(time, 'UTC'), '2026-10-15');
  assert.equal(dayIn(time, 'UTC+5.5'), '2026-10-16');
  assert.equal(dayIn(time, 'UTC-3'), '2026-10-15');
  assert.equal(dayIn(time, 'Not/AZone'), '2026-10-15');
});

test('visitor spike: once when the threshold is crossed, again after the pause', async (t) => {
  const world = await createWorld({
    config: { url: BASE, token: TOKEN, language: 'en', spike_threshold: 10 },
  });
  t.after(() => world.app.stop());
  const poll = async (active, ms = MINUTE) => {
    world.matomo.get('Blog').active = active;
    world.clock.advance(ms);
    await world.hub.pollNow();
  };
  await poll(12);
  assert.deepEqual(events(world, TRIGGERS.SPIKE).at(-1)?.data, {
    device: idsOf(world, 'Blog').device,
    website: 'Blog',
    domain: 'blog.example.org',
    visitors: 12,
    threshold: 10,
  });
  await poll(14);
  await poll(2);
  await poll(50);
  assert.equal(events(world, TRIGGERS.SPIKE).length, 1, 'still in the pause');
  await poll(50, HUB_TIMINGS.spikeCooldownMs);
  assert.equal(events(world, TRIGGERS.SPIKE).length, 2);
});

test('a spike under way when the integration starts is not announced', async (t) => {
  const matomo = new FakeMatomo();
  matomo.get('Blog').active = 99;
  const world = await createWorld({ matomo });
  t.after(() => world.app.stop());
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.SPIKE).length, 0);
});

test('goal converted: the new conversions, from 0 on a new day, never at the first start', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(events(world, TRIGGERS.GOAL).length, 0, 'the conversion of before the start');

  world.matomo.visit('Blog', { goal: true });
  world.matomo.visit('Blog', { goal: true });
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.deepEqual(events(world, TRIGGERS.GOAL).at(-1)?.data, {
    device: idsOf(world, 'Blog').device,
    website: 'Blog',
    domain: 'blog.example.org',
    conversions: 2,
    total: 3,
  });
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.GOAL).length, 1, 'nothing new');

  // Midnight in Paris (the time zone of Blog): the counters start again.
  world.clock.time = Date.UTC(2026, 9, 15, 22, 5);
  Object.assign(world.matomo.get('Blog'), { visitors: 1, visits: 1, conversions: 1 });
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.GOAL).length, 2);
  assert.equal(events(world, TRIGGERS.GOAL).at(-1).data.total, 1);
});

test('first visitor of the day: once a day, at the first visitor, not at the first start', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(events(world, TRIGGERS.FIRST_VISITOR).length, 0);
  // Shop (UTC) has no visitor yet today.
  world.matomo.visit('Shop');
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.deepEqual(
    events(world, TRIGGERS.FIRST_VISITOR).map((e) => [e.data.website, e.data.visitors]),
    [['Shop', 1]],
  );
  world.matomo.visit('Shop');
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.FIRST_VISITOR).length, 1);
});

test('no visit for N hours: when the last visit gets old, once, and again after visits', async (t) => {
  const clock = createClock();
  const matomo = new FakeMatomo({ now: clock.now });
  matomo.get('Shop').lastAction = Math.floor(clock.time / 1000) - 3600; // an hour ago
  const world = await createWorld({
    clock,
    matomo,
    config: { url: BASE, token: TOKEN, language: 'en', silence_hours: 2 },
  });
  t.after(() => world.app.stop());
  const advance = async (ms) => {
    clock.advance(ms);
    await world.hub.pollNow();
  };
  await advance(30 * MINUTE); // 1 h 30 since the last visit
  assert.equal(events(world, TRIGGERS.SILENT).length, 0);
  await advance(20 * MINUTE); // 1 h 50
  assert.equal(events(world, TRIGGERS.SILENT).length, 0);
  await advance(15 * MINUTE); // 2 h 05
  assert.deepEqual(events(world, TRIGGERS.SILENT).at(-1)?.data, {
    device: idsOf(world, 'Shop').device,
    website: 'Shop',
    domain: 'shop.example.org',
    hours: 2,
  });
  await advance(HOUR);
  assert.equal(events(world, TRIGGERS.SILENT).length, 1, 'once');
  matomo.visit('Shop');
  await advance(MINUTE);
  matomo.get('Shop').active = 0;
  await advance(3 * HOUR); // nobody there now: the last visit is asked at the next read
  await advance(MINUTE);
  assert.equal(events(world, TRIGGERS.SILENT).length, 2, 'again after a visit');
});

test('the last visit is asked only when nobody is there, every 15 minutes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const calls = [];
  const bulk = world.hub.client.bulk.bind(world.hub.client);
  world.hub.client.bulk = (list) => {
    calls.push(list.filter((c) => c.method === 'Live.getLastVisitsDetails').map((c) => c.idSite));
    return bulk(list);
  };
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  world.clock.advance(HUB_TIMINGS.silenceEveryMs);
  await world.hub.pollNow();
  const shop = String(world.matomo.get('Shop').idsite);
  assert.deepEqual(calls, [[], [shop]], 'Blog has visitors right now');
});

test('a website silent since before the start is not announced', async (t) => {
  const world = await createWorld({
    config: { url: BASE, token: TOKEN, language: 'en', silence_hours: 1 },
  });
  t.after(() => world.app.stop());
  world.clock.advance(HOUR);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.SILENT).length, 0, 'Shop never had a visit');
});

test('a restart neither announces a spike nor a conversion twice', async (t) => {
  const clock = createClock();
  const matomo = new FakeMatomo({ now: clock.now });
  const first = await createWorld({ clock, matomo });
  matomo.get('Blog').active = 20;
  matomo.visit('Blog', { goal: true });
  clock.advance(MINUTE);
  await first.hub.pollNow();
  assert.equal(events(first, TRIGGERS.SPIKE).length, 1);
  assert.equal(events(first, TRIGGERS.GOAL).length, 1);
  await first.app.stop();

  const second = await createWorld({ clock, matomo, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  clock.advance(MINUTE);
  await second.hub.pollNow();
  assert.equal(events(second, TRIGGERS.SPIKE).length, 0);
  assert.equal(events(second, TRIGGERS.GOAL).length, 0);
  assert.equal(events(second, TRIGGERS.FIRST_VISITOR).length, 0);
});

test('Matomo down: unreachable badge and status, one warning, back to normal', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  world.matomo.failure = 'down';
  const lines = await captureLogs(t, 'info', async () => {
    for (let cycle = 0; cycle < 3; cycle += 1) {
      world.clock.advance(MINUTE);
      await world.hub.pollNow();
    }
  });
  assert.equal(lines.length, 1, 'one line for an outage, not one per read');
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.equal(world.fake.connectionStatus.message.fr, 'Matomo ne répond pas');
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
  world.matomo.failure = null;
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.transports.at(-1).transport, 'local');
});

test('a call failing alone (a plugin disabled): its figure is skipped, one warning', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  world.matomo.broken['Goals.get'] = 'The plugin Goals is not enabled.';
  world.matomo.visit('Blog');
  const lines = await captureLogs(t, 'info', async () => {
    for (let cycle = 0; cycle < 3; cycle += 1) {
      world.clock.advance(MINUTE);
      await world.hub.pollNow();
    }
  });
  assert.equal(lines.length, 2, 'one line per website, not one per read');
  assert.equal(world.fake.connectionStatus.connected, true);
  const ids = idsOf(world, 'Blog');
  assert.equal(world.fake.lastState(ids.feature(FEATURE_KEYS.VISITS)), 16);
  assert.equal(world.fake.lastState(ids.feature(FEATURE_KEYS.CONVERSIONS)), 1, 'kept');
});

test('a normal cycle writes nothing at the info level', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const sent = world.fake.states.length;
  const lines = await captureLogs(t, 'info', async () => {
    for (let cycle = 0; cycle < 6; cycle += 1) {
      world.matomo.visit('Blog', { pages: 3 });
      world.clock.advance(5 * MINUTE);
      await world.hub.pollNow();
    }
  });
  assert.ok(world.fake.states.length > sent, 'states were published');
  assert.deepEqual(lines, []);
});

test('missing or refused token: a clear status, no device', async (t) => {
  const empty = await createWorld({ config: { language: 'en' } });
  t.after(() => empty.app.stop());
  assert.equal(empty.fake.connectionStatus.connected, false);
  assert.match(empty.fake.connectionStatus.message.en, /address of your Matomo/);
  assert.deepEqual(empty.fake.discoveredDevices, []);

  const noToken = await createWorld({ config: { url: BASE, language: 'en' } });
  t.after(() => noToken.app.stop());
  assert.match(noToken.fake.connectionStatus.message.en, /token/);

  const refused = await createWorld({
    config: { url: BASE, token: 'f'.repeat(32), language: 'en' },
  });
  t.after(() => refused.app.stop());
  assert.equal(refused.fake.connectionStatus.connected, false);
  assert.match(refused.fake.connectionStatus.message.en, /token refused/);
});

test('Matomo Cloud: the badge says cloud', async (t) => {
  const matomo = new FakeMatomo();
  const request = matomo.request;
  matomo.request = (url, options) =>
    request(url.replace('https://example.matomo.cloud', BASE), options);
  const world = await createWorld({
    matomo,
    config: { url: 'https://example.matomo.cloud/', token: TOKEN, language: 'en' },
  });
  t.after(() => world.app.stop());
  await createDevices(world);
  assert.equal(world.fake.transports.at(-1).transport, 'cloud');
});

test('reconfiguring the language renames the features proposed in Discovery', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.configUpdated({ url: BASE, token: TOKEN, language: 'fr' });
  const names = world.fake.discoveredDevices[0].features.map((f) => f.name);
  assert.ok(names.includes('Visiteurs en ce moment'));
  assert.ok(names.includes("Objectifs atteints aujourd'hui"));
});

test('a website no longer visible to the token disappears from Discovery', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.matomo.hidden.add(world.matomo.get('Shop').idsite);
  world.clock.advance(MINUTE);
  await world.hub.pollNow(); // access error on Shop: forgotten, the list read again
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => d.name),
    ['Blog'],
  );
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('the widget: totals, one row per website, valid content in every language', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (const language of ['en', 'fr', 'de', 'es']) {
    const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language });
    assert.equal(ack.success, true, ack.error);
    const { content } = ack.data;
    validateWidgetContent(content);
    const values = content.components.filter((c) => c.type === 'value').map((c) => c.value);
    assert.deepEqual(values, [2, 12, 15, 41, 1]);
    const rows = content.components.find((c) => c.type === 'status').items;
    assert.deepEqual(
      rows.map((row) => row.label),
      ['Blog', 'Shop'],
    );
    assert.ok(content.components.length <= 8);
  }
  await createDevices(world);
  const one = await world.fake.widgetGet(WIDGET_KEY, {
    settings: { websites: [idsOf(world, 'Shop').device] },
    language: 'en',
  });
  validateWidgetContent(one.data.content);
  assert.equal(
    one.data.content.components.find((c) => c.type === 'status'),
    undefined,
  );

  world.matomo.failure = 'down';
  const failing = await world.fake.widgetAction(WIDGET_KEY, 'refresh', {});
  assert.equal(failing.success, true, failing.error);
  const down = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  validateWidgetContent(down.data.content);
  assert.equal(down.data.content.components.length, 8, 'the budget is reached, not exceeded');
});

test('the widget asks for the server when nothing is configured', async (t) => {
  const world = await createWorld({ config: { language: 'en' } });
  t.after(() => world.app.stop());
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'de' });
  assert.match(ack.data.content.components[0].text, /dein Matomo/);
});

test('the scene action reads the figures and writes a sentence', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('get_website_stats', {
    device: idsOf(world, 'Blog').device,
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    name: 'Blog',
    active: 2,
    visitors: 12,
    visits: 15,
    pageviews: 41,
    conversions: 1,
    bounce_rate: 40,
    sentence: 'Blog: 15 visit(s) and 41 page view(s) today, 2 right now, 1 goal conversion(s).',
  });
  const unknown = await world.fake.sceneAction('get_website_stats', { device: 'other:1' });
  assert.equal(unknown.success, false);
});

test('"Test the connection" answers one line per language, with the version', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection', {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(
    ack.data.message.en,
    'Matomo 5.14.2: Connected, 2 website(s), 12 unique visitor(s) today, 2 right now',
  );
  assert.match(ack.data.message.fr, /^Matomo 5\.14\.2 : Connecté/);
});

test('the container reads Matomo on its own timer, without Gladys polling', async (t) => {
  const world = await createWorld({ timers: true });
  t.after(() => world.app.stop());
  await createDevices(world);
  world.hub.config.pollIntervalMs = 20;
  world.hub.schedulePoll();
  world.matomo.get('Blog').active = 7;
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(world.fake.lastState(idsOf(world, 'Blog').feature(FEATURE_KEYS.ACTIVE)), 7);
});

test('the scene action reads Matomo again right after an outage', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.matomo.failure = 'down';
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.equal(world.fake.connectionStatus.connected, false);
  world.matomo.failure = null;
  world.clock.advance(1000); // well before the next cycle
  const ack = await world.fake.sceneAction('get_website_stats', {
    device: idsOf(world, 'Blog').device,
  });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.outputs.visitors, 12);
});

async function captureLogs(t, level, fn) {
  const lines = [];
  const write = (chunk) => {
    lines.push(...String(chunk).split('\n').filter(Boolean));
    return true;
  };
  const before = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const stdout = t.mock.method(process.stdout, 'write', write);
  const stderr = t.mock.method(process.stderr, 'write', write);
  try {
    await fn();
  } finally {
    stdout.mock.restore();
    stderr.mock.restore();
    process.env.LOG_LEVEL = before;
  }
  return lines;
}
