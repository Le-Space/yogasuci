# PRIVACY.md — personal data and metadata

English · **[Deutsch](../PRIVACY.md)**

> Translation of [`docs/PRIVACY.md`](../PRIVACY.md). The German file is the
> original; if the two disagree, believe that one.

A full account of what this app stores and replicates, who can see it, and what
encryption would change about that.

The basis is GDPR Art. 4(1): personal data is **any** information relating to an
identified or **identifiable** person. Pseudonymous identifiers (DIDs, PeerIds)
are therefore personal data as soon as they can be linked to a person — and in a
studio that is exactly the case, because the owner knows her students.

---

## 1. The original question, answered precisely

> "We may have a privacy problem with our ledger if other students replicate it
> too."

Three statements that have to be kept apart:

**a) By design, no student replicates another student's ticket ledger.**
`tickets-<studentDid>` lives on that student's device and on studio devices
(`docs/PLAN.md` §6.1). Other students' ledgers never reach a student device — it
is not even given their addresses.

**b) That is a convention, not a technical guarantee.** OrbitDB has **no read
access control**. The access controller governs `canAppend` only, which is write
access. Anyone who knows a database address and can reach a peer holding it can
replicate and read it in full. The address is effectively the secret — and
addresses are not secrets in any cryptographic sense: they sit on studio devices,
in `localStorage`, and potentially in pairing payloads.

**c) The genuinely by-design problem was a different one:** the bookings
database. Students were given write grants on `bookings-<location>-<year>` and
replicated it **in full** — including everybody else's bookings. Whoever booked
could see who else was in that class. That was not a hole; it followed directly
from OrbitDB replicating whole logs.

> **Fixed on 2026-07-29.** The design moved to **one bookings database per
> student** (`docs/PLAN.md` §3.3), exactly like the ticket ledger. The app no
> longer distributes anybody else's personal data to students. What replaces the
> lost shared view is the `occupancy` counter (§3.3.1): plain numbers per course
> and date in the `program` database that is replicated anyway — "4 places left",
> without anyone learning **who** the other eight are.
>
> The account in §2.3 still describes **which** fields exist; the "other
> students" column there now reads ❌. The section stays because the data still
> exists — just not on classmates' devices.

In short: the ledger remains the smaller risk (convention plus knowledge of an
address). The larger one is gone with the new cut — structurally, not through
cryptography.

---

## 2. Account: payload data

Visibility legend — **O** owner · **S** studio devices · **W** the student
themselves · **A** other students.

### 2.1 `registry` (§3.1)

| Field                            | Contents                 | personal data                                | O   | S   | W   | A   |
| -------------------------------- | ------------------------ | -------------------------------------------- | --- | --- | --- | --- |
| `studio.name`                    | name of the studio       | no (a company)                               | ✅  | ✅  | ✅  | ✅  |
| `studio.ownerDid`                | the owner's DID          | **yes**                                      | ✅  | ✅  | ✅  | ✅  |
| `location.name`, `.address`      | location, street address | no (business address)                        | ✅  | ✅  | ✅  | ✅  |
| `device.deviceDid`               | a studio device's DID    | **yes** (device ↔ member of staff)           | ✅  | ✅  | ✅  | ✅  |
| `device.label`                   | e.g. "iPad front desk"   | **possibly** — free text, may contain a name | ✅  | ✅  | ✅  | ✅  |
| `device.role`, `.locationId`     | role, assignment         | **yes** (place of work)                      | ✅  | ✅  | ✅  | ✅  |
| `device.grantedAt`, `.revokedAt` | timestamps               | **yes** (employment history)                 | ✅  | ✅  | ✅  | ✅  |

The registry is **deliberately readable by everyone**: it is the offline basis for
verifying device signatures and revocations. A device that cannot read it cannot
tell a revoked device from a valid one. Encryption is therefore **not an option**
here — data minimisation on `device.label` is (name the device, not the person).

`device.grantedAt`/`revokedAt` incidentally form a rough **employment history**.
For a member of staff that is noticeably more than "a device was registered".

### 2.2 `program` (§3.2)

Contains **no** personal data: courses, times, capacities, prices. The one edge
case is a course title naming a teacher ("Yin with Maria") — the convention is no
names in course titles; teacher assignment comes later via the registry.

### 2.3 `bookings-<location>-<year>` (§3.3) — the critical set

| Field              | Contents                      | personal data                | O   | S   | W   | A          |
| ------------------ | ----------------------------- | ---------------------------- | --- | --- | --- | ---------- |
| `studentDid`       | the student's DID             | **yes**                      | ✅  | ✅  | ✅  | ⚠️ **yes** |
| display name/alias | self-chosen                   | **yes**                      | ✅  | ✅  | ✅  | ⚠️ **yes** |
| `courseId`, `date` | which class, when             | **yes** — attendance profile | ✅  | ✅  | ✅  | ⚠️ **yes** |
| status             | requested/confirmed/cancelled | **yes**                      | ✅  | ✅  | ✅  | ⚠️ **yes** |

`studentDid` + `courseId` + `date` over a season produce a **movement and
attendance profile**: who is regularly where, and when. In a small town,
re-identification from such a pattern is trivial even under a pseudonym. This is
the most serious point in this document.

A yoga class can also imply **health data** (GDPR Art. 9) — a postnatal course, a
rehabilitation or prevention course says something about a person's health. As
soon as such courses are in the programme, the booking list is a special category
of personal data, and replicating it in full to classmates is no longer
defensible.

### 2.4 `tickets-<studentDid>` (§3.4)

| Field                                         | Contents                        | personal data                             | O   | S   | W   | A    |
| --------------------------------------------- | ------------------------------- | ----------------------------------------- | --- | --- | --- | ---- |
| `studentDid`                                  | DID                             | **yes**                                   | ✅  | ✅  | ✅  | ❌ ¹ |
| `payment.amountEUR`, `.method`, `.receivedAt` | amount, method, time            | **yes** — financial data                  | ✅  | ✅  | ✅  | ❌ ¹ |
| `issuedBy`, `redeemedBy`                      | device + location               | **yes** (both sides: student _and_ staff) | ✅  | ✅  | ✅  | ❌ ¹ |
| `redeem.courseId`, `.date`                    | every single visit              | **yes** — a complete attendance record    | ✅  | ✅  | ✅  | ❌ ¹ |
| `void.reason`                                 | refund / transfer / lost-device | **yes**                                   | ✅  | ✅  | ✅  | ❌ ¹ |

¹ Only for as long as the address stays unknown — see §1b. That is access
control by obscurity, not by permission.

The ledger is **more sensitive** in content than the bookings database (it holds
payments and every single visit) but is distributed far more narrowly.

---

## 3. Account: metadata

This data appears in no schema and is replicated or observed all the same. It is
the part payload encryption does **not** remove.

### 3.1 In every OrbitDB entry

Verified against `@orbitdb/core` (`src/oplog/entry.js`, `src/oplog/log.js`):

| Field                 | Contents                                                | covered by payload encryption? |
| --------------------- | ------------------------------------------------------- | ------------------------------ |
| `entry.identity`      | hash of the writer's identity → resolvable to their DID | **no**                         |
| `entry.key`           | the writer's public key                                 | **no**                         |
| `entry.clock`         | Lamport counter, ID = the writer's public key           | **no**                         |
| `entry.next`, `.refs` | log structure: how many entries, in what order          | **no**                         |
| `entry.hash` / CID    | identifier of every entry                               | **no**                         |
| `entry.payload`       | the actual data                                         | **yes**                        |

The consequence: with `encryption.data`, **who wrote how often and in what order**
stays visible — only _what_ does not. For a ticket ledger that means the number of
visits and their order remain readable; the course and the date do not.

`entry.identity` is not incidental here, it is load-bearing: the ledger's security
rests on every event being attributable to a registered device. Encrypt that link
and fork detection goes with it.

### 3.2 At the network layer

| Datum                      | Contents                        | who sees it                                                                          |
| -------------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| libp2p **PeerId**          | stable node identifier          | every connected peer                                                                 |
| **IP address**             | via ICE candidates in the SDP   | the peer at the other end **and** everyone whose hands the offer text passes through |
| **STUN lookup**            | IP + roughly when it was used   | the STUN operator (default: Google, Cloudflare)                                      |
| **time of the connection** | when somebody was at the studio | both sides                                                                           |

The SDP payload is the underestimated one: it contains **local and public IP
addresses**. Shared through a messenger (§4.2, "remote path"), the device's IP
address ends up with the messenger operator and in every chat the text is passed
through. With WhatsApp or email that is disclosure to a third party.

Available countermeasure: `?ice=host` skips STUN and therefore the public address
(it then only works on the same network — which in a studio is the normal case).

### 3.3 On the device

| Datum                    | Where                                     | Note                                                                                                                 |
| ------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| WebAuthn credential      | `localStorage`                            | holds the credential ID and public key, **not** the private key — that stays in the authenticator                    |
| `userId` / `displayName` | in the passkey and the authenticator      | chosen freely at registration; an email address here is a decision, not a requirement                                |
| database addresses       | `localStorage`                            | see §1b — whoever reads them can replicate                                                                           |
| blockstore / datastore   | IndexedDB                                 | complete logs, unencrypted at rest                                                                                   |
| OrbitDB signing key      | IndexedDB (`level-js-orbitdb/identities`) | unencrypted at rest; derived from the passkey's PRF, generated without PRF. Whoever reads it can sign as this device |

**IndexedDB is not encrypted.** Anyone with physical access to an unlocked studio
device reads every ledger of every student it has ever seen — no passkey, no
signature check. For the front-desk iPad that is the realistic attack, not the
network.

---

## 4. What encryption can do, and what it cannot

`@orbitdb/core` supports encryption natively through the `encryption` option of
`orbitdb.open`, at two levels:

- **`encryption.data`** — encrypts `entry.payload`. Log structure, writer
  identity and ordering stay visible (§3.1).
- **`encryption.replication`** — encrypts the encoded entry as a whole. Far more
  is hidden; in exchange **every** peer that is to synchronise needs the key.

The key can be bound to the passkey via **WebAuthn PRF**. The pieces are already
in our pinned dependency `@le-space/orbitdb-identity-provider-webauthn-did`:
`generateSecretKey`, `wrapSKWithPRF`, `unwrapSKWithPRF`. Reference integration:
[`NiKrause/de2do`](https://github.com/NiKrause/de2do) →
`src/lib/encryption/webauthn-encryption.js`.

### The catch that decides it here

PRF binds the key to **one** passkey. That is precisely wrong for a ticket
ledger, which is **multi-writer**: every registered studio device has to read and
write it, at every location. A key bound to Alice's passkey would be worthless on
Carol's front-desk device.

PRF encryption is therefore usable where exactly one identity reads:

| Data set                 | PRF encryption sensible?                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `registry`               | **no** — has to be readable offline by everyone, or revocation cannot be checked                    |
| `program`                | no — no personal data                                                                               |
| `bookings-<loc>`         | **not like this** — many writers and readers; only a different cut helps (§5)                       |
| `tickets-<studentDid>`   | **partly** — only if the key is shared between student and studio devices, not bound to one passkey |
| **export/backup** (T5.2) | **yes, without reservation** — exactly one reader, the owner                                        |

For multi-writer data the right construction is a per-database **content key**,
wrapped separately for each authorised DID (the classic envelope scheme) — with
re-wrapping on every grant and, harder, a key-rotation problem on every
revocation. That is a work package of its own, not a configuration switch.

---

## 5. Recommendation

Ordered by effect, not by effort:

1. **Cut the bookings database per student rather than encrypting it.**
   Replicating `bookings-<location>-<year>` to classmates is the one place where
   the app systematically distributes other people's personal data. One bookings
   database per student (write access: the student plus studio devices) solves it
   structurally — no key management, no rotation problem. The cost: counting
   capacity per date has to happen on studio devices rather than on the student's.
   **This is the proposal.**
2. **Data minimisation now**: an alias rather than a real name, no email as
   `userId`, `device.label` naming the device rather than the person, no teachers'
   names in course titles.
3. **An honest consent text**: before the first booking it has to say who can see
   which bookings — for as long as point 1 is not implemented.
4. **Encrypt export/backup with PRF** (T5.2). Exactly one reader, no distribution
   problem — the de2do integration transfers directly.
5. **`?ice=host` as the default in the studio**, STUN only for the remote path.
   The SDP payload carries IP addresses; inside the studio they are not needed.
6. **Health-related courses** (rehabilitation, postnatal, prevention) should be
   marked and their bookings never placed in a shared database — not even if
   point 1 is deferred for effort reasons.

Not recommended: `encryption.data` on the ticket ledger as a quick fix. It hides
the course and the date, leaves the number and order of visits visible, and buys
that at the price of a key distribution problem across every studio device — a
poor trade.

---

## 6. Open points

- **No deletion concept.** Append-only and GDPR Art. 17 (right to erasure) do not
  sit together easily. A `void` event ends a ticket but deletes nothing. The
  realistic route is crypto-shredding (destroy the key) — which presupposes
  encryption — or a documented retention period with rotation and genuine
  discarding of old periods.
- **Processing on behalf.** There is no server and therefore no processor; the
  studio devices are controllers. Legally that is rather simpler — but so are the
  student devices that replicate other people's bookings. Not yet assessed.
- **A record of processing activities** (Art. 30) does not exist; this document is
  groundwork for one, not a substitute.
- None of this is legal advice.
