// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// A threshold on one figure is already a scene condition on the device
// feature. The action is about what a condition cannot do: put the figures of
// a website in a message ("Blog: 132 visits and 410 page views today, 4 right
// now, 3 goal conversions"). It reads Matomo again when the last read is
// older than 15 seconds.
// -----------------------------------------------------------------------------

import { missingCredentials } from './config.js';
import { ACTION_TEXT, CONNECTION_TEXT, SENTENCE_TEXT, pick } from './texts.js';

export const SCENE_ACTIONS = {
  async get_website_stats(hub, { fields = {} }) {
    const language = hub.config.language;
    const missing = missingCredentials(hub.config);
    if (missing) {
      throw new Error(pick(CONNECTION_TEXT[missing], language));
    }
    // After a failed read too: a short outage must not fail the scene.
    await hub.refreshIfStale();
    hub.assertReadable();
    const site = hub.find(fields.device);
    if (!site) {
      throw new Error(pick(ACTION_TEXT.unknownWebsite, language));
    }
    const figures = {
      active: site.active ?? 0,
      visitors: site.visitors ?? 0,
      visits: site.visits ?? 0,
      pageviews: site.pageviews ?? 0,
      conversions: site.conversions ?? 0,
      bounce_rate: site.bounceRate ?? 0,
    };
    const words = SENTENCE_TEXT[language] ?? SENTENCE_TEXT.en;
    const parts = [
      words.today(site.name, figures.visits, figures.pageviews),
      words.active(figures.active),
    ];
    if (figures.conversions > 0) {
      parts.push(words.goals(figures.conversions));
    }
    return { name: site.name, ...figures, sentence: `${parts.join(', ')}.` };
  },
};
