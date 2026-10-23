// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Matomo, a temporary
// /data and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs: the tests read Matomo with
// `world.hub.pollNow()`. (Adapted from guim31/gladys-umami.)
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { websiteIds } from '../../src/devices.js';
import { Store } from '../../src/store.js';
import { BASE, FakeMatomo, TOKEN, website } from './fakeMatomo.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

/** A manual clock, shared by the hub and the tests: 15/10/2026, 10:00 UTC. */
export function createClock(start = Date.UTC(2026, 9, 15, 10, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export async function createWorld({
  clock = createClock(),
  matomo = new FakeMatomo({ now: clock.now }),
  config = { url: BASE, token: TOKEN, language: 'en' },
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-matomo-')),
  timings = {},
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: matomo.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, matomo, app, hub: app.hub, clock, dataDir };
}

/** External ids of the device of a website of the fake, by name. */
export const idsOf = (world, name) => websiteIds(world.gladys, world.matomo.get(name).idsite);

/** Add discovered devices in Gladys, as the user would (all by default). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated(device);
  }
}

export { BASE, FakeMatomo, TOKEN, website };
