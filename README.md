<br />

<p align="center"><b>Community fork of Plane, focused on Helpdesk + integrated project management</b></p>

<p align="center">
    <img alt="License: AGPL v3" src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg">
    <img alt="Based on Plane" src="https://img.shields.io/badge/based%20on-Plane-6366f1.svg">
    <a href="https://github.com/makeplane/plane"><img alt="Upstream" src="https://img.shields.io/badge/upstream-makeplane%2Fplane-lightgrey.svg"></a>
</p>

<br />

> ⚠️ **This is an independent, unofficial fork**, community-maintained on top of the open-source code of
> [Plane](https://plane.so) (© Plane Software, Inc.), licensed under **AGPL-3.0**. This repository is **not
> affiliated with, endorsed by, or maintained by Plane Software, Inc.** "Plane" and its brand belong to their
> respective owners — this fork exists to extend the original open-source product, not to pass itself off as it.

---

## 🧭 Why this fork exists

[Plane](https://plane.so) is an excellent, genuinely open-source (AGPL-3.0) project management tool. But some
features I consider essential for real teams — like a **Helpdesk** integrated into the development workflow and a
per-member **KPI/scoring engine** — either don't exist in the open-source edition, or sit behind a paid plan.

It's not a commercial product, it doesn't sell anything, and it has no intention of competing with the official
Plane — it's an open continuation, for anyone who wants to use it or contribute.

## 🌟 What this fork adds

On top of everything Plane already offers natively (issues, cycles, modules, views, pages, analytics — see below),
this fork adds:

- ### 🎫 Helpdesk

  A workspace-level support module: support portals (public or authenticated) where anyone can open a ticket,
  which agents respond to and can forward to any project's Intake — linking the customer's request directly to the
  engineering work, without duplicating information.
  📄 Technical details and history: [`HELPDESK_FEATURE.md`](./HELPDESK_FEATURE.md)

- ### 📊 KPI — team scoring engine

  A fully configurable scoring engine (no magic numbers in the code) that scores work items by difficulty,
  repetitiveness, priority, and due date, with an adjustable penalty/bonus curve for delays or early delivery. The
  main screen is a **read-only** dashboard showing each project member's score plus overall project charts; a work
  item's Difficulty/Repetitive parameters are set at task creation time, and the scoring engine itself is
  configurable by the team lead on a dedicated Settings screen with a live curve preview.
  📄 Technical details and history: [`KPI_FEATURE.md`](./KPI_FEATURE.md)

- ### 🤖 Native AI agent (planned)
  A native AI assistant for interacting with the workspace in natural language, with permission controls and
  auditing — not implemented yet, see [`AI_NATIVE_AGENT_FEATURE.md`](./AI_NATIVE_AGENT_FEATURE.md).

These features are developed and documented openly in the `*_FEATURE.md` files at the repo root — each one serves
as the technical spec, architecture decisions, and changelog for that feature.

## 🧱 About the original project (Plane)

This fork is based on [Plane](https://plane.so/), an open-source project management tool maintained by
[Plane Software, Inc.](https://github.com/makeplane). All credit for the foundation — architecture, editor, issue
engine, cycles, modules, views, pages, analytics, and the huge amount of engineering behind it — goes to Plane's
maintainers and community. I strongly recommend checking out the original project, and if it fits your use case,
considering their official [Plane Cloud](https://app.plane.so).

- Original repository: [github.com/makeplane/plane](https://github.com/makeplane/plane)
- Official website: [plane.so](https://plane.so)
- Official documentation: [docs.plane.so](https://docs.plane.so)

## 🚀 Installation

The deployment process is the same as upstream Plane (same stack, same manifests) — this fork's features run on
top of the same infrastructure.

| Method     | Docs                                                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker     | [![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://developers.plane.so/self-hosting/methods/docker-compose)         |
| Kubernetes | [![Kubernetes](https://img.shields.io/badge/kubernetes-%23326ce5.svg?style=for-the-badge&logo=kubernetes&logoColor=white)](https://developers.plane.so/self-hosting/methods/kubernetes) |

For local development, see [CONTRIBUTING](./CONTRIBUTING.md).

## 🌟 Features (inherited from Plane)

- **Work Items** — create and manage tasks with a rich text editor, sub-properties, and cross-issue references.
- **Cycles** — track sprints with burn-down charts.
- **Modules** — break complex projects into manageable modules.
- **Views** — custom filters, saved and shareable.
- **Pages** — AI-assisted notes with a rich text editor, convertible into actionable items.
- **Analytics** — real-time insights across your workspace data.

## ⚙️ Stack

[![React Router](https://img.shields.io/badge/-React%20Router-CA4245?logo=react-router&style=for-the-badge&logoColor=white)](https://reactrouter.com/)
[![Django](https://img.shields.io/badge/Django-092E20?style=for-the-badge&logo=django&logoColor=green)](https://www.djangoproject.com/)
[![Node JS](https://img.shields.io/badge/node.js-339933?style=for-the-badge&logo=Node.js&logoColor=white)](https://nodejs.org/en)

## 🤝 Contributing

Contributions are welcome — for this fork's features (Helpdesk, KPI, etc.) open an issue or PR directly here. For
bugs or requests related to Plane's core itself, consider also reporting to the
[original repository](https://github.com/makeplane/plane/issues), since this fork doesn't automatically cherry-pick
upstream fixes.

## 🛡️ Security

If you find a vulnerability, please report it responsibly instead of opening a public issue — see
[SECURITY.md](./SECURITY.md).

## 📄 License

This project is distributed under the **GNU Affero General Public License v3.0** — see [`LICENSE.txt`](./LICENSE.txt).

As an AGPL-3.0 fork, any distributed modification (including running it as a network-accessible service) must
remain under the same license, with source code made available. The original copyright notices from Plane
Software, Inc. present in the files are kept intact, as required by the license.
