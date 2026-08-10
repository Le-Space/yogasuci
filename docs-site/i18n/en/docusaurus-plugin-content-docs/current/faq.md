---
title: Common questions
sidebar_position: 5
---

# Common questions

The questions everybody asks when they are shown this app for the first time.
Without answers, "no server, no account" sounds like a shortcoming — it is in
fact the whole point.

As of 7 August 2026. When something changes, this page changes with it.

## What is a passkey, and how is it different from a password?

A password is a **shared secret**: you know it, the other side knows it, and both
can lose it. That is exactly why phishing works, and why stolen password
databases are a business.

A passkey is a **key pair**. The private half never leaves your device. Only a
signature is transmitted, and it is only ever valid for the one thing that was
just signed.

So there is nothing here anybody could talk out of you, and nothing sitting in a
database somewhere waiting to be stolen.

## Why are there no accounts? Where does the passkey live?

The passkey lives where your device keeps its keys — secure enclave, TPM,
hardware key or password manager. Not in the app, not in browser storage.

The point that makes it click: **nobody is being logged in to.** There is no
counterparty saying "yes, that is you". Your signature authorises an entry in a
book, and every other device checks it for itself.

An account would be a row in a table on a server. There is neither table nor
server.

## How can this work with no server?

Because nothing is **looked up** centrally.

Every pass is a chain of signed events that is only ever appended to. A balance
is never stored, always computed from that chain — which is why two locations
independently arrive at the same number without talking to each other.

And the student carries the synchronisation themselves: their device brings their
own book from one location to the next.

## Can you lose a passkey?

**Yes. This is the honest edge of the design.**

With no server there is nobody to answer "forgot password". Lose the passkey and
you lose access to what it signed.

What helps today:

- **The export.** Back up regularly — see [Make a backup](/studio/setup).
- **Where the passkey lives matters.** One in a password manager that syncs
  between your devices survives losing the phone. One in the device's secure
  enclave does not.
- **More than one device.** A studio that has approved a second device does not
  lose its studio with one device.

For students the damage is bounded: the ticket book belongs to the studio that
sold it. A pass you paid for is not gone when the phone is gone — it only has to
be reassigned.

A real answer is being worked on, without introducing a central party to do it.
Until then this question is only partly answered, and we would rather say so than
write around it.

## Why is privacy particularly well protected here?

Because there is no third party processing anything. No provider, no data
processing agreement, no analytics, no backup held by somebody else.

That is not a promise but a shape: there is no place where the data of all
studios comes together — so there is none that can be lost or sold.

<div class="no-server">

**What fellow students can see — and what they cannot**
Until July 2026 the app replicated one shared booking list to every student.
Whoever booked could see who else was in the class. That has been changed: each
student has their own booking book, and what remains is a plain counter — "4
places left", without anybody learning **who** the other eight are.

</div>

## Where exactly is my data?

On the devices. In the browser's storage (IndexedDB), nowhere else. On no server,
in no cloud, in no backup other than the one you export yourselves.

| What                                | Who holds it                                                |
| ----------------------------------- | ----------------------------------------------------------- |
| Studio, locations, approved devices | studio devices, and every student device that has connected |
| Timetable and prices                | the same                                                    |
| Your bookings                       | your device and the studio devices                          |
| Your passes                         | the devices of the studio that sold them, and your device   |

The full inventory — which field is personal data and who replicates it — is in
the [privacy chapter](/privacy) and in full in the repository under
`docs/PRIVACY.md`.

## What is encrypted, and what is not?

The question where guessing would be most expensive. So, precisely:

**In transit: always.** Every connection between two devices is encrypted (DTLS,
as in a video call). That the device at the other end really is the one you
scanned is guaranteed by the signature on the invitation.

**Your signing key: yes.** The key your device signs with is stored encrypted and
unlocked once per session through the passkey.

**The databases on the device: no.** Timetable, bookings and passes sit
unencrypted in browser storage. Anyone who picks up an **unlocked** device reads
along. A lock screen and device encryption do more about that than the app could
— which is why it is in our privacy statement rather than in small print.

**Where it belongs and is still missing:** in a backup on somebody else's
storage. There encryption is a precondition, and an easy one, because there is
exactly one reader.

**Where it would buy nothing:** access rules and database identifiers. They hold
no personal data, and encrypting them would cost the auditability that makes the
signatures worth having in the first place.

**And what encryption fundamentally does not do here:** it hides the **content**
of an entry, not its **existence**. How often somebody checks in would stay
visible even encrypted.
