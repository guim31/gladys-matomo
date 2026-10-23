# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-23

### Added

- The websites of a Matomo server (self-hosted Matomo 4 or 5, or Matomo Cloud)
  as Gladys devices, read with an authentication token: visitors right now
  (last 30 minutes), and the unique visitors, visits, page views, goal
  conversions and bounce rate of the day.
- Scene triggers: visitor spike, first visitor of the day, goal reached, no
  visit for a while.
- Scene action "Read the figures of a website", with a ready-made sentence.
- Dashboard widget "Matomo today".
- "Test the connection" action; texts and documentation in English, French,
  German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-matomo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-matomo/releases/tag/v1.0.0
