---
title: Privacy
sidebar_position: 30
---

# Privacy

## What lives where

| Data                       | Lives on                              |
| -------------------------- | ------------------------------------- |
| Studio, locations, devices | every connected device                |
| Courses and prices         | every connected device                |
| A student's bookings       | their device and the studio's devices |
| A student's pass account   | their device and the studio's devices |

There is **no** place where it all comes together. No provider, no analytics, no
statistics flowing anywhere.

## What students see of each other

Nothing. A student's device does not receive other people's bookings or passes —
it is not given their addresses in the first place. Places left is a number, not a
list of names.

It was once otherwise. Until 29 July 2026 the design had a shared booking list per
location, which every student would have replicated in full — everybody else's
bookings included. That was changed before anybody used the app.

## What the studio's devices see

Everything about their students: bookings, purchases, every single visit with date
and location. That is necessary — without it there is no check-in and no
accounting — but it is also more than a paper list ever held.

The devices themselves incidentally produce a kind of **employment history**: when
a device was approved and when it was revoked is in the registry and readable by
everyone.

## Data minimisation, practically

- **No real name needed.** An alias is enough.
- **No email address needed.** Freely chosen when creating the passkey.
- **Name devices after the device**, not the person: "front desk iPad" rather than
  "Maria's iPad".
- **No teachers' names in course titles** — titles go to everybody.
- **Health-related courses** (postnatal, rehabilitation, prevention) say something
  about a person's health. Treat those lists accordingly.

## What happens when connecting from afar

A connection code shared through a messenger contains your device's network
addresses. In the studio, use the QR code — it does not leave the room.

## "How do I know you really store nothing?"

A fair question. "No server" is a claim, and privacy claims are cheap. Here is
what you can check yourself — and, just as plainly, where checking stops.

### Where does this app actually run?

Nowhere, at least not with us. What you use is a bundle of HTML, JavaScript and
images living in the **IPFS** network. `yogasuci.le-space.de` is not a machine
of ours; it is a pointer to a public gateway that hands those files out.

A gateway is a photocopier: it passes files through and nothing else. It cannot
see what you do in the app, because from then on the app works directly between
your devices. Your bookings never travel through the gateway, and we could not
collect them there either.

### How do I check that without technical knowledge?

Three things that need no expertise.

**First: turn the network off.** Open the app, wait for it to load, then switch
on flight mode. It keeps working — courses, bookings, passes. An app that kept
its data at a provider would be empty at this point.

**Second: fetch the same app from somewhere else.** Every release gets a
**CID** — a checksum of its entire content. The same CID through a gateway that
is not ours:

- [dweb.link](https://bafybeicvgquga6sy273jm76fnmrs3oqjpmqdyifeuk7ilpjxadt3sv6bji.ipfs.dweb.link/)
  (run by Protocol Labs)

If the same app appears there, it cannot depend on a server of ours — that
gateway has never heard of us.

**Third: ask the domain what it points at.**

```
dig +short TXT _dnslink.yogasuci.le-space.de
```

The answer names exactly the CID being served. Change the app and the CID
changes; a different CID is different content. That is arithmetic, not trust.

### Which version is being served right now?

As of 24 August 2026:

| What       | Value                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| CID        | `bafybeicvgquga6sy273jm76fnmrs3oqjpmqdyifeuk7ilpjxadt3sv6bji`                    |
| Commit     | [`6fcf1801`](https://github.com/Le-Space/yogasuci/commit/6fcf1801)               |
| Deployment | [run 32747804930](https://github.com/Le-Space/yogasuci/actions/runs/32747804930) |

This table goes stale with the next deployment — the DNS query above always
names the current one. Since 24 August 2026 every
[deployment run](https://github.com/Le-Space/yogasuci/actions/workflows/deploy.yml)
carries a summary at the top with commit, CID and gateway links, so the chain
from source to what your browser loads can be walked step by step.

### Does that prove you collect nothing?

**No.** This limit belongs here, because otherwise somebody will overstep it on
your behalf.

Proven: the app comes from the IPFS network, we run no server that hands it
out, and the content served is fixed by a checksum. Not proven: that this
content sends nothing in secret. A checksum says _that_ something is unchanged,
not _what_ it does.

For that there are two other routes. The [source](https://github.com/Le-Space/yogasuci)
is fully open — anyone who can read code, can read it. And anyone who cannot
opens the browser's developer tools (F12), "Network" tab, and sees every
connection the app makes. After loading, nothing should be there except
connections to your own devices.

One honest gap: the source does not **byte-for-byte** imply the CID served,
because our build is not designed to be reproducible. The chain is followable
through the public build log — which commit produced which CID — rather than by
rebuilding it yourself. Fixing that would be an improvement, and it is written
down.

### What does IPFS Companion give me?

[IPFS Companion](https://docs.ipfs.tech/install/ipfs-companion/) is a browser
extension that works with an IPFS node running on your own machine. With both
installed, the browser fetches the app **past the gateway**, straight from the
network.

That removes the last intermediary: not even the public gateway then sees that
somebody loaded this app. Everyday use does not need it — but for the question
"does this really run without a server?", it is the clearest answer you can
produce yourself.

A fuller introduction to the approach is in the
[Local-First FAQ](https://local-first.le-space.de/#faq).

## The long version

The complete account — which fields are personal data, what encryption would
change, and what is still open — is in
[`docs/PRIVACY.md`](https://github.com/Le-Space/yogasuci/blob/main/docs/PRIVACY.md).
It is written as groundwork for a record of processing activities and is not legal
advice.
