# Matomo

[Matomo](https://matomo.org/) is the open source (GPL-3.0) web analytics
platform, self-hosted or on Matomo Cloud. This integration brings the figures
of your Matomo websites into Gladys: each website becomes a device with its
visitors right now and its unique visitors, visits, page views, goal
conversions and bounce rate of the day. Scenes can react to a visitor spike,
to the first visitor of the day, to a goal reached, or to a website that
receives no visit any more (a broken tracking code); a dashboard widget shows
the day at a glance, and a scene action puts the figures of a website in a
message.

Tested against a real self-hosted Matomo 5.14.2 (Docker, MariaDB); not yet on
Matomo Cloud: feedback welcome on
[the issues](https://github.com/guim31/gladys-matomo/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A Matomo 4 or 5, self-hosted or on [Matomo Cloud](https://matomo.org/),
  reachable from the Gladys machine.
- An **authentication token** (`token_auth`) of a Matomo user with **view**
  access to the websites. A dedicated view-only user is best: the token gives
  the rights of its user.

At each refresh the integration sends **one** request to the Reporting API for
up to 20 websites (a bulk request: visitors of the last 30 minutes, visits,
page views and goals of the day), plus the website list every 10 minutes. The
token is always sent in the body of a POST request, never in an address. Gladys
accepts 300 states per minute: with the 30-second interval, add 25 websites at
most to Gladys.

## Getting started

### 1. Create a token

In Matomo, as a super user, create a user with the **View** access on the
websites to follow (**Administration → System → Users**), or use your own
account. Logged in as this user, open **Personal → Security → Auth tokens**,
click **Create new token**, and copy the token (32 characters, shown only
once).

### 2. Configure the integration

In Gladys, open **Integrations → Matomo → Configuration**:

- **Matomo address**: the address you open Matomo with, for example
  `https://stats.example.org`, `http://192.168.1.10:8080` or
  `https://example.matomo.cloud`. An address copied from the browser is
  understood; a sub-folder (`https://example.org/matomo`) is kept.
- **Authentication token**: the token of step 1.
- **Refresh interval**: from 30 seconds to 5 minutes (1 minute by default).
- **Visitor spike from**: the visitors at the same time that fire the "Visitor
  spike" trigger (10 by default).
- **No visit for (hours)**: the hours without any visit that fire the "No
  visit for a while" trigger (24 by default).
- **Language of the names**: language of the feature names and of the scene
  results (French by default).

Save, then click **Test the connection**: the result gives the version of
Matomo, the number of websites, the unique visitors of the day and the
visitors right now.

### 3. Add the websites

Open the **Discover** tab: each website is proposed with its name. Add the ones
you want to see in Gladys. The scene triggers and the widget work for every
website, added or not.

## The devices

Each website becomes a device with:

- **Visitors right now**: the visitors of the last 30 minutes, as in the
  "Real-time visitors" widget of Matomo.
- **Unique visitors today**: unique visitors of the day.
- **Visits today**: visits of the day.
- **Page views today**: page views of the day.
- **Goal conversions today**: conversions of all the goals of the website.
- **Bounce rate today**: the share of visits that saw a single page, in
  percent.

"Today" is the day of the website in Matomo (its time zone, in the website
settings): the daily figures go back to 0 at its midnight. A value that does
not change is sent again every 12 hours, so Gladys keeps it recent. The badge
of the devices says "local" for your own server, "cloud" for Matomo Cloud, and
"unreachable" when Matomo does not answer.

## Dashboard

The **Matomo today** widget shows five tiles (visitors right now, unique
visitors, visits, page views and goals of the day), added up over the
websites shown, then one row per website with its unique visitors of the day
and its visitors right now, the busiest first. In the widget settings, choose
some websites to show only them (devices added to Gladys). The **Refresh**
button reads Matomo again.

## Scenes

### Triggers

- **Visitor spike**: the visitors right now of a website reach the threshold
  of the configuration. Once per spike, and 30 minutes at least between two
  announcements for a website: a spike still under way at the end of the
  pause is announced then. Variables: website name, domain, visitors right
  now, threshold.
- **First visitor of the day**: a website receives its first visitor of the
  day. Variables: website name, domain, unique visitors today.
- **Goal reached**: a website records new goal conversions. Variables: website
  name, domain, new conversions, conversions today.
- **No visit for a while**: a website that had visits receives none for the
  hours of the configuration: the tracking code may be broken, or the website
  down. Once, until a visit comes again. Variables: website name, domain,
  hours without a visit.

Each trigger can be limited to some websites (empty: any). What the triggers
remember is kept in the `/data` volume: a restart of Gladys or of the
integration does not announce a spike, a first visitor or a conversion twice.
Nothing is announced at the first read of a website: a spike or a silence
already under way is only recorded. If the integration was stopped, the
conversions and the first visitor of the meantime are announced at the first
read after it starts again.

### Actions

- **Read the figures of a website**: gives the `name`, the visitors right now
  (`active`), the `visitors`, `visits`, `pageviews`, `conversions` and
  `bounce_rate` of the day, and a ready-made `sentence`, for example "Blog: 15
  visit(s) and 41 page view(s) today, 2 right now, 1 goal conversion(s).".

### Scene ideas

- When **Goal reached** fires for your shop, send a Telegram message
  "{{website}}: {{conversions}} new conversion(s), {{total}} today".
- When **No visit for a while** fires, send a notification "No visit on
  {{website}} for {{hours}} h: check the tracking code".
- Every evening at 21:00, **Read the figures of a website** and send the
  `sentence` by message.
- With the device feature **Visitors right now** as a scene condition, light
  a lamp in green while someone is on the website.

## Troubleshooting

- **"token refused"**: the token is wrong, deleted or expired: create a new
  one in **Personal → Security**.
- **"no Matomo at this address"**: check the address and the port; it is the
  folder where `index.php` lives.
- **"the address redirects"**: enter the `https://` address directly.
- **"certificate refused"**: the HTTPS certificate is self-signed or expired:
  use the `http://` address in your network, or a trusted certificate.
- **"Matomo reports an error"**: the logs of the integration give the message
  of Matomo (a database error, a plugin disabled...).
- A website is missing: the user of the token needs the **View** access to it.
  The list is read again every 10 minutes, or with **Search** in the Discover
  tab.
- The figures of the day move by steps: Matomo computes them when a report is
  asked ("browser-triggered archiving"). If it is turned off on your server,
  they follow the archiving cron job (hourly by default); the visitors right
  now are always live.
- **Goal conversions today** stays empty: the Goals plugin is disabled.
  **Visitors right now** stays empty: the Live plugin, or the visits log, is
  disabled.
- The logs of the integration (**Integrations → Matomo**) say more; nothing is
  written there during a normal reading cycle.

## Limits

- Read-only: the integration does not change anything in Matomo.
- The figures are those of Matomo at the time of the read, with the refresh
  interval as delay (and the archiving of Matomo for the figures of the day).
- One Matomo server per integration, 200 websites at most.
- The thresholds of "Visitor spike" and "No visit for a while" are the same
  for every website; "Goal reached" counts all the goals of a website
  together.
- Matomo 3 and older are not supported.
- Not tested on Matomo Cloud yet, and not affiliated with Matomo or InnoCraft.
