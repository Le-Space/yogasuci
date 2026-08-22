# yogasuci

**[Deutsch](README.de.md)** · English

Peer-to-peer class booking for yoga studios with more than one location. The
programme, the passes and the check-in run directly between devices — **no
server, no account, and no relay unless somebody switches one on**.

Two devices find each other because a person carries a signed code between them:
scanned as a QR code at the front desk, pasted, or sent through a messenger.
After that they replicate directly over WebRTC.

A relay exists for the case a carried code cannot bridge — two devices on
different mobile networks, where neither can reach the other. It is off by
default, it is never contacted unless it is switched on, and switching it on
introduces the two devices to each other: the passes and the check-ins still go
directly between them, not through it.

> **Status:** M1–M5 are implemented — registry, programme editor, bookings, cash
> sales, check-in with the courier roundtrip, fork alarm, export and recovery,
> reconciliation and the benchmark suite. The binding plan is
> [`docs/PLAN.md`](docs/PLAN.md) (German); what the design cannot do is
> [`docs/LIMITS.md`](docs/LIMITS.md).

## Getting started

```bash
pnpm install
pnpm dev
```

Node ≥ 22 is enforced (`engine-strict`).

```bash
pnpm test        # vitest (ledger, Node) + Playwright (Chromium)
pnpm check       # types
pnpm lint        # prettier + eslint
pnpm bench       # scaling scenarios, writes bench/report.md
```

### Watching a single use case

Every end-to-end file is one use case, and any of them can be run alone with a
visible browser. Useful when a step is behaving oddly and the trace does not say
why — you see the two devices side by side, doing what a person would do:

```bash
npx playwright test e2e/m4-tickets.spec.js --headed
```

`-g` narrows it to one test within the file, matching on the test name:

```bash
npx playwright test e2e/m2-connect.spec.js -g "through the camera" --headed
```

| File                         | Use case                                           |
| ---------------------------- | -------------------------------------------------- |
| `e2e/m0-shell.spec.js`       | App shell, navigation, theme, language             |
| `e2e/m1-program.spec.js`     | Studio setup, locations, programme, packages       |
| `e2e/m2-connect.spec.js`     | The QR handshake itself: code, link, camera, paste |
| `e2e/m2-devices.spec.js`     | Approving a front-desk device, and revoking it     |
| `e2e/m2-identity.spec.js`    | Passkey identity and the DID behind it             |
| `e2e/m2-studio-join.spec.js` | A device joining somebody else's studio            |
| `e2e/m3-booking.spec.js`     | Booking and cancelling classes                     |
| `e2e/m4-tickets.spec.js`     | Selling a pass, check-in, the courier roundtrip    |
| `e2e/m5-recovery.spec.js`    | Export, restore, and a lost passkey                |
| `e2e/m5-report.spec.js`      | Cash report and reconciliation                     |
| `e2e/m5-sync-status.spec.js` | Replication status, and who sees which screens     |
| `e2e/a11y.spec.js`           | Accessibility                                      |

Two of these are slower than they look: `m4-tickets` and `m5-report` each run
three devices through a full libp2p, Helia and OrbitDB stack, so a single test
can take a minute or two before anything appears to happen.

The suite runs with `?ice=host` — host candidates only, no STUN lookup — so a
run never depends on a STUN server being reachable. That is also why the
readiness panel shows no network rows during tests: with STUN deliberately off,
a red network light would report a setting as a fault.

### The one run that does use STUN

```bash
REMOTE_SCENARIO=1 npx playwright test --project=remote
```

Two devices in two separate browsers, each reached over a websocket rather than
launched, connected only by a pasted code — and no `?ice=host`, so ICE runs for
real. It is the only test that touches the claim the whole app rests on: two
devices find each other directly, with no server and no relay in between. That
is the path the app has to be able to take with nothing switched on, which is
what "relay-optional by construction" means and what this proves.

The project does not exist unless `REMOTE_SCENARIO` is set, so it never joins
the gate and competes with it for machines. Point `REMOTE_WS_ENDPOINT` (and
`REMOTE_SECRET`) at a remote Playwright server and the second device moves to
another network without the test changing —
[#38](https://github.com/Le-Space/yogasuci/issues/38) is where that goes next.

## How it works

**The ticket ledger is the core.** Every pass is an append-only log of `issue`,
`redeem` and `void` events, each signed by the device that wrote it. A balance is
never stored, always folded — which is why two locations redeeming the same pass
independently arrive at the same answer without talking to each other.

**The student is the sync courier.** Their device carries their own ledger from
location to location. Because check-in pulls the latest heads _before_ redeeming,
location B sees location A's redemption as soon as the same person turns up —
a property of how the ledger is read, not of anything sitting in the middle.

**The studio keeps the books.** A ticket ledger is created under a shared studio
access controller, so its address follows from the student's DID and the owner's
rather than being handed over. Whoever took the money decides whether a ticket
exists; the student can read their passes and cannot write to them.

**Tampering is made evident, not prevented.** Monotonic `seq` plus
`prevRedeemHash` plus a device signature turn any rolled-back ledger into a
visible fork at the next sync, with both signed events as evidence. An ambiguous
log can cost a unit; it can never hand one out.

**The code is what authenticates.** Two devices that met by QR skip libp2p's
Noise handshake — not because the connection is unencrypted (DTLS encrypts
either way) but because signing the SDP already proved who is on the other end:
the SDP carries the DTLS fingerprint, so a valid signature binds that WebRTC
session to a Peer ID. Same binding `certhash` gives WebRTC-Direct, carried by a
signature instead of a multiaddr. The long version, including when this stops
being safe, is
[`connection-security.md`](https://github.com/NiKrause/libp2p-webrtc-qr/blob/main/docs/connection-security.md)
in the transport package.

Full limits — including what happens behind symmetric NATs without TURN, and what
OrbitDB's whole-database replication means for privacy — in
[`docs/LIMITS.md`](docs/LIMITS.md).

## Layout

```
src/lib/ledger/     pure TypeScript: balance reducer, chain and fork checks
src/lib/db/         OrbitDB stores, access control, reconciliation, export
src/lib/p2p/        libp2p over @le-space/libp2p-webrtc-qr, QR signalling
src/lib/identity/   passkey DID (WebAuthn)
src/lib/styles/     Le-Space design tokens
e2e/                Playwright: alice / carol / bob fixtures
bench/              deterministic scaling scenarios
docs/               PLAN · DESIGN · LIMITS · PRIVACY · TESTING · DEPLOY
```

`src/lib/ledger/` stays free of UI, browser and OrbitDB — the most critical logic
has to be testable without a browser.

## Handbook

The user-facing handbook — for owners, front-desk staff and students, in German
and English — lives in [`docs-site/`](docs-site/), published at
[le-space.github.io/yogasuci](https://le-space.github.io/yogasuci/) and alongside the
app at `/handbuch/`. It
is deliberately separate from `docs/` below, which is the engineering record.

## Documents

The plan and the design notes are written in German; English translations live in
[`docs/en/`](docs/en/) and are listed in [`docs/en/README.md`](docs/en/README.md).
Code comments reference the German paths, which is why those stay where they are.

| File                                 | Contents                                                      |
| ------------------------------------ | ------------------------------------------------------------- |
| [`docs/PLAN.md`](docs/PLAN.md)       | Architecture, data model, milestones — binding                |
| [`docs/DESIGN.md`](docs/DESIGN.md)   | Le-Space tokens with a source per value, measured contrast    |
| [`docs/LIMITS.md`](docs/LIMITS.md)   | Design limits and upstream questions                          |
| [`docs/PRIVACY.md`](docs/PRIVACY.md) | Personal data and metadata, and what encryption does about it |
| [`docs/TESTING.md`](docs/TESTING.md) | Test strategy, real-device checklist                          |
| [`docs/DEPLOY.md`](docs/DEPLOY.md)   | Publishing to Aleph IPFS, DNS, SEO                            |
| [`CLAUDE.md`](CLAUDE.md)             | Conventions for working with Claude Code                      |

The security model of the QR connection itself lives with the transport:
[`connection-security.md`](https://github.com/NiKrause/libp2p-webrtc-qr/blob/main/docs/connection-security.md)
— why `skipEncryption` is sound with a signed SDP, and when it is not.

## Licence

Apache-2.0 OR MIT
