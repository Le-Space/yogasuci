---
title: What is still to come
sidebar_position: 40
---

# What is still to come

This page is deliberately careful in its wording. What is here is planned or
considered — not promised. What the app can do **today** is in the chapters before
it; what it cannot do is under [What the app cannot
do](/what-it-cannot-do).

## Invite links instead of carrying codes — next

**The most important open item.** Today two devices are connected by somebody
carrying a code: scan a QR, or copy text, paste it, carry the answer back. A field
test showed where that falls apart — which text field, which role, which of two
strings is the right one.

The successor is an **invite link**. You create an invite, share it through the
ordinary share sheet, and the other device simply opens it. The page verifies the
invite and produces the reply by itself. No text field, no role, nothing to mix up.

The part that matters for privacy, and the reason this is defensible at all: the
data sits in the **fragment** of the address — everything after the `#`. Browsers
do not send that to a server, as a rule. The link looks like it leads somewhere;
the sensitive part still never leaves the device.

The QR code stays: it then carries the link. It grows by roughly thirty characters
and remains well below what a camera reads reliably.

It also brings a correction a studio will feel: the connection used to give up
after thirty seconds, although setting one up can take longer.

Built in the example of
[`libp2p-webrtc-qr` v0.2.0](https://github.com/NiKrause/libp2p-webrtc-qr/releases/tag/v0.2.0);
what it means for this app is in
[issue #23](https://github.com/Le-Space/yogasuci/issues/23).

## A connection check before things jam

Today, when a connection fails to come up, all you see is that it failed. What went
wrong — browser, network, camera — has to be guessed, and guessed at the counter
with people waiting.

Planned is an overview that checks this beforehand and turns each line green, amber
or red:

- **Browser** — does it do WebRTC at all? Some browsers do not, and then no network
  in the world will help.
- **Network and STUN** — is a STUN server reachable? It is needed as soon as two
  devices are not on the same Wi-Fi. Running the app deliberately without STUN via
  `?ice=host` gives **amber** here, not an error: that is a setting, not a fault.
- **TURN** — only when it becomes necessary. None is set up today, and on some
  networks — corporate Wi-Fi, some mobile carriers — STUN is not enough. This line
  should name that rather than keep quiet about it.
- **Camera** — is it permitted, and does it deliver a picture? Without a camera,
  QR scanning is out.

**The microphone is deliberately not checked.** The app never asks for it; a red
light for it would warn about something that cannot break anything.

What such a check **cannot** do, and that belongs here too: a STUN server answering
does not mean these two devices will find each other. The lights show whether the
preconditions hold — not whether it will work.

Details in [issue #26](https://github.com/Le-Space/yogasuci/issues/26).

## Backup on decentralised storage

Today your backup lives wherever you put it: **Export** downloads a file, and where
it lands is your decision. Without a server there is no alternative — there is
nobody for it to live with.

That works, but it has an uncomfortable edge. If **all** of a studio's devices are
lost at once — theft, fire, water — then only what somebody exported and put
somewhere still exists.

So the plan is an **optional** backup on decentralised storage, for instance over
**Filecoin**. Optional in a strict sense: a studio that does not want it loses no
function. A studio that switches it on gets a copy that survives losing every
device.

### What it is waiting on

A module for this already exists:
[`orbitdb-storage-bridge`](https://github.com/NiKrause/orbitdb-storage-bridge).
It takes an OrbitDB database apart into its blocks — log entries, manifest,
identities, access control — uploads them individually, and on restore reassembles
them so that the original identity is preserved. That last part is the hard one: a
backup that loses the identity gives you a database whose older entries nobody can
verify any more.

The catch was: the module uploaded through **Storacha's** infrastructure, and
Storacha no longer exists as a company. The module has since moved on: from version
0.7.0 (September 2026) it is called `orbitdb-storage-bridge` and backs up
through interchangeable storage providers. Aleph and Pinata are connected; Pinata is
tested against a real account, restore included. What remains is wiring it in here.
That is work at a known place rather than an open design question — but it is done
when it is done, which is why no date is given.

### What has to be thought through

A copy on somebody else's storage raises exactly the questions this app otherwise
does not have, and they need answering before it is built:

- **Who can read it?** An unencrypted backup on public storage would be the
  opposite of what this app is for. Encryption is not a garnish here but a
  precondition — and unlike the shared databases it is straightforward, because
  there is exactly **one** reader: the studio (see the account in
  `docs/PRIVACY.md`).
- **What happens to an erasure request?** What is on distributed storage cannot be
  called back. The workable route is to destroy the key rather than the data, which
  presupposes encrypting from the start.
- **Does it change the data protection relationship?** Today nobody but you
  processes anything. A storage provider would be a third party — and then the
  question of a data processing agreement arises, which at present explicitly does
  not. That needs settling before the switch exists.

## What else is open

- **Series tickets for single dates.** A series can be booked; selling a single
  class out of one is still missing.
- **A privacy notice for students.** A template a studio can adapt and hand over —
  you are the controller, not us.
- **Erasure.** The logs are append-only. What that means for an erasure request is
  open, and is not talked around.

The full technical picture is in the
[repository](https://github.com/Le-Space/yogasuci) — including everything too small
for a chapter of its own here.
