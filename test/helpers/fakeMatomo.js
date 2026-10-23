// -----------------------------------------------------------------------------
// An in-memory Matomo: its websites and figures rendered like the Reporting
// API of Matomo 5.14 (checked against the real answers of
// test/fixtures/matomo in test/client.test.js). Answers POST requests to
// index.php, the bulk request included, and refuses a wrong token as Matomo
// does (HTTP 200, `{ result: "error" }`).
// -----------------------------------------------------------------------------

export const BASE = 'http://192.0.2.10:8080';
export const TOKEN = '0123456789abcdef0123456789abcdef';

let next = 1;

/** A website of the fake, with a quiet day. */
export function website(fields = {}) {
  const n = next++;
  return {
    idsite: 100 + n,
    name: `Site ${n}`,
    main_url: `https://site${n}.example.org`,
    timezone: 'Europe/Paris',
    active: 0,
    visitors: 0,
    visits: 0,
    pageviews: 0,
    conversions: 0,
    bounceRate: 0,
    // Unix seconds of the last action, 0 for none.
    lastAction: 0,
    ...fields,
  };
}

const error = (message) => ({ result: 'error', message });

export class FakeMatomo {
  constructor({ websites, now = () => Date.now() } = {}) {
    this.websites = websites ?? [
      website({
        name: 'Blog',
        main_url: 'https://blog.example.org',
        active: 2,
        visitors: 12,
        visits: 15,
        pageviews: 41,
        conversions: 1,
        bounceRate: 40,
      }),
      website({ name: 'Shop', main_url: 'https://shop.example.org', timezone: 'UTC' }),
    ];
    this.now = now;
    this.token = TOKEN;
    /** 'down': the server does not answer; a number: that HTTP status. */
    this.failure = null;
    /** Methods answering a Matomo error (a plugin disabled): method → message. */
    this.broken = {};
    /** idSites the token can no longer see. */
    this.hidden = new Set();
    this.requests = [];
    this.request = this.request.bind(this);
  }

  get(name) {
    return this.websites.find((item) => item.name === name);
  }

  /** A new visit on a website, now. */
  visit(name, { pages = 1, goal = false } = {}) {
    const site = this.get(name);
    site.active += 1;
    site.visitors += 1;
    site.visits += 1;
    site.pageviews += pages;
    site.conversions += goal ? 1 : 0;
    site.lastAction = Math.floor(this.now() / 1000);
  }

  call(params) {
    const method = params.get('method');
    if (this.broken[method]) {
      return error(this.broken[method]);
    }
    if (method === 'API.getMatomoVersion') {
      return { value: '5.14.2' };
    }
    if (method === 'SitesManager.getSitesWithAtLeastViewAccess') {
      return this.websites
        .filter((site) => !this.hidden.has(site.idsite))
        .map((site) => ({
          idsite: site.idsite,
          name: site.name,
          main_url: site.main_url,
          timezone: site.timezone,
          type: 'website',
        }));
    }
    const id = Number(params.get('idSite'));
    const site = this.websites.find((item) => item.idsite === id);
    if (!site || this.hidden.has(id)) {
      return error(
        `You can't access this resource as it requires 'view' access for the website id = ${id}.`,
      );
    }
    switch (method) {
      case 'Live.getCounters':
        return [
          { visits: site.active, actions: site.active, visitors: site.active, visitsConverted: 0 },
        ];
      case 'VisitsSummary.get':
        return {
          nb_uniq_visitors: site.visitors,
          nb_visits: site.visits,
          nb_actions: site.pageviews,
          bounce_rate: `${site.bounceRate}%`,
        };
      case 'Actions.get':
        return { nb_pageviews: site.pageviews, nb_uniq_pageviews: site.pageviews, hits: 0 };
      case 'Goals.get':
        return { nb_conversions: site.conversions, revenue: 0, conversion_rate: '0%' };
      case 'Live.getLastVisitsDetails':
        return site.lastAction ? [{ lastActionTimestamp: site.lastAction }] : [];
      default:
        return error(`The method '${method}' does not exist.`);
    }
  }

  async request(url, { method, body }) {
    if (this.failure === 'down') {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }
    if (typeof this.failure === 'number') {
      return { status: this.failure, body: '<html>nope</html>' };
    }
    const params = new URLSearchParams(body);
    this.requests.push(params.get('method'));
    if (method !== 'POST' || url !== `${BASE}/index.php` || params.get('module') !== 'API') {
      return { status: 404, body: 'Not found' };
    }
    if (params.get('token_auth') !== this.token) {
      return {
        status: 200,
        body: JSON.stringify(
          error('Unable to authenticate with the provided token. It is either invalid or expired.'),
        ),
      };
    }
    let data;
    if (params.get('method') === 'API.getBulkRequest') {
      data = [];
      for (let index = 0; params.has(`urls[${index}]`); index += 1) {
        data.push(this.call(new URLSearchParams(params.get(`urls[${index}]`))));
      }
    } else {
      data = this.call(params);
    }
    return { status: 200, body: JSON.stringify(data) };
  }
}
