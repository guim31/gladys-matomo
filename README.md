# Matomo for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings the figures of your [Matomo](https://matomo.org/) websites — on
your own server or on Matomo Cloud — into Gladys.

- **One device per website**: visitors right now (last 30 minutes), and the
  unique visitors, visits, page views, goal conversions and bounce rate of the
  day.
- **Scene triggers**: visitor spike (above a threshold of your choice), first
  visitor of the day, goal reached, no visit for N hours (a broken tracking
  code) — for any website, added to Gladys or not.
- **Scene action**: read the figures of a website, with a ready-made sentence
  for a message.
- **Dashboard widget**: the day at a glance, per website.
- Texts in English, French, German and Spanish.

Tested against a real self-hosted Matomo 5.14.2 (Docker, MariaDB 11), with
visits and goal conversions sent to its tracking API. Developed without a
Matomo Cloud account (same Reporting API): feedback welcome on
[the issues](https://github.com/guim31/gladys-matomo/issues).

## Requirements

- Gladys Assistant 5.1.0 or later.
- A Matomo 4 or 5 (self-hosted or Matomo Cloud) and the authentication token
  (`token_auth`) of a user with view access to the websites.

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter
`https://github.com/guim31/gladys-matomo`. Then open its configuration: enter
the address of your Matomo and the token (Matomo: **Personal → Security → Auth
tokens**), and add the websites from the Discover tab.

The full guide: [docs/en.md](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

At the chosen interval (one minute by default), the container sends one
`API.getBulkRequest` to the Reporting API for up to 20 websites:
`Live.getCounters` (last 30 minutes), `VisitsSummary.get`, `Actions.get` and
`Goals.get` for the day (time zone of each website in Matomo), and
`Live.getLastVisitsDetails` every 15 minutes when nobody is on a website (for
"no visit for N hours"). The website list
(`SitesManager.getSitesWithAtLeastViewAccess`) is read every 10 minutes. The
token always travels in the body of a POST request, and redirects are not
followed, so it is never sent to another host. The container publishes the
states of the devices added to Gladys when they change and fires the scene
events on transitions; what the triggers remember is kept in `/data`, so a
restart announces nothing twice.

## Limits

- Read-only, one Matomo server per configuration, 200 websites at most.
- The spike and silence thresholds are the same for every website; "Goal
  reached" counts all the goals of a website together.
- The figures of the day (and "Goal reached") follow the archiving of Matomo:
  every 15 minutes at most by default, or at each archiving cron job.
- Matomo 3 and older are not supported. A self-signed HTTPS certificate is not
  accepted (use `http://` on the local network).

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

See [CLAUDE.md](CLAUDE.md) for the project rules and the notes on the Matomo
API.

## Credits

- [Matomo](https://github.com/matomo-org/matomo) by InnoCraft and contributors
  (GPL-3.0): the API answers in `test/fixtures/matomo` come from its official
  Docker image. The Matomo logo of the cover comes from its repository
  (`plugins/Morpheus/images/logo.svg`, the word in white on the dark
  background); Matomo is a trademark of InnoCraft Ltd.
- Built from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js)
  and on the architecture of
  [gladys-umami](https://github.com/guim31/gladys-umami).

Not affiliated with Matomo or InnoCraft Ltd.

## License

Apache-2.0, see [LICENSE](LICENSE).
