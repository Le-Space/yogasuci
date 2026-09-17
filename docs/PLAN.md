# Yoga-Buchung — P2P-PWA (Plan v2)

Relay-freie Peer-to-Peer-PWA für Yogastudios mit **mehreren Locations**.
Signalisierung ausschließlich über `@le-space/libp2p-webrtc-qr` (QR-Scan) mit
Copy-&-Paste-Fallback. Kein Relay, kein Signaling-Server, kein Backend.
Zahlungsmittel v1: **nur Barzahlung**. Zweisprachig **DE/EN**. Dark & Bright Mode
im Le-Space-Stil. Vorbereitet für die Umsetzung mit **Claude Code**.

Baut auf: `simple-todo` (`acl01`: mutable DID-Write-Grants, `passkey01`:
WebAuthn/Passkey-DID) und `NiKrause/libp2p-webrtc-qr`.

---

## 1. Rollen und Grundidee

**Studio-Inhaberin** (Root-Identität) registriert Locations und Geräte.
**Front-Desk/Lehrer:innen-Geräte** verkaufen und entwerten Tickets an ihrer
Location. **Schüler:innen** replizieren Programm und eigene Tickets, buchen
Stunden — und fungieren als **Sync-Kuriere** zwischen Locations (Abschnitt 5).

Ohne Relay gibt es zwei Sync-Gelegenheiten:

1. **Im Studio (QR):** Kamera-Scan des signierten SDP-Payloads → direkte
   WebRTC-Verbindung → Replikation, Ticketkauf, Entwertung. Hauptpfad.
2. **Remote (Copy & Paste / Teilen):** Offer/Answer als Text über beliebigen
   Kanal — in der UI per Web Share API direkt in Signal, WhatsApp, E-Mail
   etc. teilbar, Copy-&-Paste als universeller Fallback. Beide Seiten
   gleichzeitig online; kein TURN → symmetrische NATs
   können scheitern. UI braucht einen geführten Verbindungs-Assistenten mit
   ehrlichem Fehlerpfad.

Buchungen sind **nicht asynchron** wie bei einem Server. Die UI unterscheidet
überall sichtbar zwischen _lokal erfasst_ und _angekommen/bestätigt_ („Stand
vom …").

## 2. Technologie-Stack

- **Frontend:** SvelteKit (adapter-static), pnpm, PWA via vite-plugin-pwa
- **P2P:** js-libp2p mit `@le-space/libp2p-webrtc-qr` als einzigem Transport
- **Daten:** Helia (IPFS) + OrbitDB, Persistenz LevelBlockstore/IndexedDB
  (nicht MemoryStorage wie im `main`-Kapitel von simple-todo)
- **Identität:** Passkey-DID (`passkey01` / `Le-Space/orbitdb-identity-provider-webauthn-did`)
- **ACL:** Mutable DID-Write-Grants nach `acl01`, plus Geräteregister (Abschnitt 4)
- **i18n:** Paraglide JS, DE/EN
- **Styling:** Tailwind CSS mit Le-Space-Design-Tokens als CSS Custom Properties
  (Abschnitt 8)
- **Tests:** Playwright E2E, Chromium zuerst (webrtc-qr-CI-Limit)

## 3. Studio-Modell: Locations und Geräteregister

Oberste Einheit ist das **Studio** mit der Inhaberinnen-DID als Root of Trust.

### 3.1 `registry` — Studio, Locations, Geräte (Single Writer: Inhaberin)

```json
{ "_id": "studio", "type": "studio",
  "name": "Yoga Eggenfelden", "ownerDid": "did:key:…" }

{ "_id": "location:altstadt", "type": "location",
  "name": { "de": "Studio Altstadt", "en": "Old Town Studio" },
  "address": "…", "active": true }

{ "_id": "device:<deviceDid>", "type": "device",
  "deviceDid": "did:key:…",
  "role": "owner | front-desk | teacher",
  "locationId": "location:altstadt",
  "label": "iPad Empfang Altstadt",
  "grantedAt": "…", "revokedAt": null }
```

Das ist das acl01-Grant-Muster eine Ebene höher: Geräte werden per
P2P-Pairing mit dem Inhaberinnen-Gerät registriert, Grants sind widerrufbar
(`revokedAt`). Jedes registrierte Gerät hält eine Kopie der Registry und kann
damit Signaturen anderer Studio-Geräte **offline** verifizieren.

### 3.2 `program` — Kurse & Pakete (Writer: owner + berechtigte Geräte)

Wie v1, plus `locationId` pro Kurs. Pakete gelten studioweit (eine 10er-Karte
ist an allen Locations einlösbar — das ist der Sinn von Multi-Location).

Kurse gibt es in zwei Modi: **offene wöchentliche Stunden** (Drop-in) und
**geschlossene Kursreihen** (z. B. Anfängerkurs, 1× oder 2× wöchentlich über
5+ Wochen, als Ganzes gebucht — auch das Format von
Krankenkassen-Präventionskursen).

```json
// Offene wöchentliche Stunde (Drop-in)
{ "_id": "course:vinyasa-mi-18", "type": "course",
  "mode": "recurring",
  "locationId": "location:altstadt",
  "title": { "de": "Vinyasa Flow", "en": "Vinyasa Flow" },
  "weekday": 3, "time": "18:00", "durationMin": 75,
  "capacity": 12,
  "validFrom": "2026-09-01",     // optional: Angebot gilt ab …
  "validUntil": null,            // optional: … bis (z. B. Sommerpause)
  "active": true }

// Geschlossene Kursreihe (z. B. 2× wöchentlich, 5 Wochen)
{ "_id": "course:anfaenger-h26", "type": "course",
  "mode": "series",
  "locationId": "location:altstadt",
  "title": { "de": "Anfängerkurs Herbst", "en": "Beginners course, autumn" },
  "time": "18:00", "durationMin": 90, "capacity": 10,
  "sessions": [ { "date": "2026-09-08" }, { "date": "2026-09-10" },
                { "date": "2026-09-15" }, { "date": "2026-09-17" },
                { "date": "2026-09-22" } /* … */ ],
  "priceEUR": 95.00,             // Preis der Reihe als Ganzes
  "allowDropIn": true,           // einzelne Termine auch per Karte besuchbar
  "active": true }

// Paket / Preisstufe
{ "_id": "package:10er", "type": "package",
  "name": { "de": "10er-Karte", "en": "10-class pass" },
  "kind": "single | week | ten | month | year",
  "priceEUR": 120.00,
  "units": 10,                   // null bei Zeitkarten (week/month/year)
  "validityDays": 180,
  "validityStart": "issue | firstRedeem",  // ab Kauf oder ab erster Nutzung
  "saleFrom": null, "saleUntil": null }    // optionales Verkaufsfenster (Aktionen)
```

Bei Kursreihen speichert der Editor die **konkreten Termine** (`sessions`),
nicht nur das Muster: Er generiert sie als Vorschlag aus Startdatum,
Wochentagen und Wochenzahl, die Inhaberin kann einzelne Termine streichen
oder verschieben (Ferien, Feiertage). Die Gültigkeit einer Reihe ergibt sich
implizit aus erster und letzter Session.

Gültigkeits-Regeln zusammengefasst: Kurse haben optionale absolute
Ab-bis-Fenster (`validFrom`/`validUntil` bzw. Session-Liste); Pakete haben
relative Gültigkeit (`validityDays`, wahlweise ab Kauf oder ab erster
Entwertung) plus optionales Verkaufsfenster; das konkrete Ticket bekommt beim
Kauf sein absolutes Fenster in den `issue`-Event geschrieben (siehe 3.4) —
der Ledger prüft immer nur gegen das Ticket-Fenster, nie gegen das Paket.

Einzelkarte, Wochenkarte, 10er, Monats- und Jahreskarte sind damit
Parametrisierungen desselben Paket-Dokuments; die Kursreihe ist ein Kurs mit
eigenem Preis, dessen Kauf ein **kursgebundenes Ticket** erzeugt: ein
`issue`-Event mit `courseId`, `unitsTotal: null` (kein Abzug pro Besuch,
Anwesenheit wird trotzdem als `redeem` protokolliert) und dem Fenster von
erster bis letzter Session. Der Ledger lehnt Entwertungen kursgebundener
Tickets für fremde Kurse ab.

### 3.3 `bookings-<studentDid>` — Buchungen **pro Schüler** (Multi-Writer: Schüler + Studio-Geräte)

> **Entwurfsänderung gegenüber Plan v2** (entschieden am 2026-07-29, Begründung
> in [`PRIVACY.md`](./PRIVACY.md)). Ursprünglich war eine Buchungs-DB pro
> Location und Jahr vorgesehen, auf die Schüler Write-Grants bekommen. Das war
> die einzige Stelle, an der die App systematisch **fremde** personenbezogene
> Daten verteilt hat: Weil OrbitDB immer ganze Logs repliziert, sah jeder
> buchende Schüler die Buchungen aller anderen — DID, Alias, Kurs, Termin,
> Status. Über eine Saison ergibt das ein Anwesenheitsprofil, und bei Reha-,
> Rückbildungs- oder Präventionskursen sind das Gesundheitsdaten nach
> DSGVO Art. 9.
>
> Verschlüsselung löst das nicht: Sie hinterlässt bei Payload-Verschlüsselung
> weiterhin Schreiber-DID, Eintragszahl und Reihenfolge im Klartext und
> handelt sich bei Multi-Writer ein Schlüsselverteilungs- und
> Rotationsproblem ein. Der Zuschnitt löst es strukturell und ohne Kryptografie.

Eine kleine Buchungs-DB pro Schüler, exakt nach dem Muster des Ticket-Ledgers
(3.4): Schreibrecht für den Schüler selbst und für alle registrierten,
nicht widerrufenen Studio-Geräte. Der Schüler repliziert **nur seine eigene**;
Studio-Geräte sammeln die aller Schüler, die sie je gesehen haben.

```json
{
	"_id": "booking:<uuid>",
	"type": "booking",
	"studentDid": "did:key:…",
	"courseId": "course:vinyasa-mi-18",
	"date": "2026-09-09", // null bei einer als Ganzes gebuchten Reihe
	"locationId": "location:altstadt",
	"status": "requested | confirmed | declined | cancelled",
	"requestedAt": "…",
	"decidedBy": { "deviceDid": "did:key:…", "locationId": "…" },
	"decidedAt": "…"
}
```

**Jahres-Rotation entfällt.** Sie existierte, weil eine Standort-DB über
Jahre auf Hunderttausende Einträge wuchs. Eine Schüler-DB hat ~120 Einträge
pro Jahr (~0,2 MB) — nach vier Jahren unter 1 MB. Was bleibt, ist die
_Anzahl_ der DBs auf Studio-Geräten, und dagegen wirkt Lazy-Open + LRU
(6.4), das für die Ticket-Ledger ohnehin gebaut wird. Beide Bestände nutzen
damit dieselbe Mechanik.

Statusregel unverändert: Studio-Geräte setzen `confirmed | declined`,
Schüler nur `requested | cancelled` (App-Logik über der DB-ACL, da OrbitDB
keine Feld-Level-Rechte kennt — in `docs/LIMITS.md` dokumentiert).

#### 3.3.1 `occupancy` — Belegungszähler (Writer: Studio-Geräte)

Der Zuschnitt kostet etwas, und das muss ersetzt werden: Ohne gemeinsame
Buchungs-DB kann ein Schülergerät nicht mehr selbst zählen, ob eine Stunde
voll ist. Deshalb schreiben Studio-Geräte einen **aggregierten, nicht
personenbezogenen** Zähler in die `program`-DB, die alle ohnehin replizieren:

```json
{
	"_id": "occupancy:course:vinyasa-mi-18:2026-09-09",
	"type": "occupancy",
	"courseId": "course:vinyasa-mi-18",
	"date": "2026-09-09",
	"confirmed": 8,
	"capacity": 12,
	"updatedBy": { "deviceDid": "did:key:…" },
	"updatedAt": "…"
}
```

Nur Zahlen, keine Personen — damit bleibt „noch 4 Plätze frei" für alle
sichtbar, ohne dass jemand erfährt, **wer** die anderen acht sind. Der Zähler
ist bewusst nur ein Anzeigewert: Verbindlich entscheidet das Studio-Gerät beim
Bestätigen, das die Buchungs-DBs tatsächlich vor sich hat. Zwei Schüler, die
gleichzeitig den letzten Platz anfragen, bekommen beide `requested` und einer
danach `declined` — genau wie in jedem Studio ohne Server.

### 3.4 `tickets-<studentDid>` — Ticket-Ledger **pro Schüler** (Multi-Writer: Studio-Geräte)

Der zentrale Umbau gegenüber v1. Statt eines Studio-Ledgers eine kleine DB pro
Schüler, Schreibrecht für alle registrierten (nicht widerrufenen) Studio-Geräte,
repliziert auf dem Schülergerät. Append-only: `issue` und `redeem` sind Events,
nie In-Place-Updates.

**Angelegt wird das Ledger vom Studio, nicht vom Schüler.** Wer die Zahlung
erhalten hat, entscheidet über das Ticket — das trug schon immer die Signatur im
`issue`-Event, aber das _Buch_ gehörte dem Schüler, und damit auch die Macht, dem
Studio das Schreibrecht zu entziehen. Alle Ledger eines Studios teilen deshalb
einen Access-Controller mit fester Schreibliste (Owner). Weil ein
OrbitDB-Manifest den Ersteller nicht enthält, folgt die Adresse allein aus
`yoga-tickets-<studentDid>` und der Owner-DID: jedes Gerät leitet sie ab, keines
bekommt sie gesagt, und der Schüler ist weder Admin noch Writer seines eigenen
Ledgers. Begründung und Messwerte in `docs/LIMITS.md` §1.7.

```json
{ "_id": "ticket:<uuid>", "type": "issue",
  "studentDid": "did:key:…", "packageId": "package:10er",
  "courseId": null,          // gesetzt bei kursgebundenen Reihen-Tickets
  "unitsTotal": 10,          // null bei Zeitkarten und Reihen-Tickets
  "payment": { "method": "cash", "amountEUR": 120.00, "receivedAt": "…" },
  "issuedBy": { "deviceDid": "did:key:…", "locationId": "location:altstadt" },
  "validFrom": "2026-08-01", "validUntil": "2027-01-28",
  "validityStart": "issue | firstRedeem",
  "sig": "<Signatur des ausstellenden Geräts>" }

{ "_id": "redeem:<uuid>", "type": "redeem",
  "ticketId": "ticket:<uuid>",
  "seq": 3,
  "prevRedeemHash": "<Hash von redeem seq=2>",
  "courseId": "course:vinyasa-mi-18", "date": "2026-08-05",
  "redeemedBy": { "deviceDid": "did:key:…", "locationId": "location:west" },
  "redeemedAt": "…",
  "sig": "<Signatur des entwertenden Geräts>" }

// Entwertung des Tickets selbst: Erstattung oder Übertrag auf neue DID
{ "_id": "void:<uuid>", "type": "void",
  "ticketId": "ticket:<uuid>",
  "reason": "refund | transfer | lost-device",
  "transferTicketId": "ticket:<uuid-neu>",   // bei Übertrag: das Nachfolge-Ticket
  "voidedBy": { "deviceDid": "did:key:…", "locationId": "…" },
  "voidedAt": "…",
  "sig": "<Signatur>" }
```

Restguthaben = `unitsTotal` − Anzahl gültiger `redeem`-Events; deterministisch
aus dem Log, auf allen Geräten identisch. Multi-Writer ist CRDT-technisch
konfliktfrei (eindeutige IDs, append-only) — das einzige Risiko ist
**Staleness**, und die adressiert Abschnitt 5. `payment.method` bleibt Enum
(PayPal/Bitcoin/Lastschrift später ohne Schema-Bruch).

## 4. Verbindungs- und Ticket-Flows

### 4.0 Vorstellung ≠ Beitritt

Bei der Umsetzung von T4.3 fiel eine Unterscheidung auf, die der Plan implizit
lässt und die beide Male gebraucht wird:

- **Vorstellen** heißt: „meine DID ist X, meine Buchungen liegen dort, mein
  Ledger dort." Das passiert bei **jeder** Verbindung, gewährt nichts und ist
  bloß eine Behauptung. Ohne sie kann eine Theke ein Gerät weder bedienen noch
  einchecken, weil sie dessen Adressen nicht kennt.
- **Beitreten** heißt: „ich öffne die Registry und das Programm dieses Studios."
  Das passiert nur auf einem Gerät, das noch kein Studio hat.

Beides zusammenzufassen war ein Fehler: Ein Schüler, der bereits einem Studio
beigetreten war, ließ die Vorstellung aus — und die **zweite** Location erfuhr
seine DID nie und konnte ihn nicht einchecken. Genau der Fall, den §5 Schicht 1
braucht.

### 4.1 Geräte-Onboarding (Inhaberin ↔ neues Studio-Gerät)

QR-Handshake wie beim Schüler-Pairing; Inhaberin schreibt den `device`-Eintrag
in die Registry und erteilt die nötigen DB-Grants. Widerruf ebenso per
Registry-Update; alle Geräte lernen ihn bei ihrer nächsten Verbindung.

### 4.2 Schüler-Pairing, Kauf, Buchung

Wie v1: PWA-Installation per Plakat-QR (statisches Hosting/IPFS-Gateway — kein
Relay), QR-Handshake, DID-Austausch, Grants, Initial-Replikation. Barkauf:
„Bar erhalten" → `issue`-Event → repliziert sofort über die stehende Verbindung.

### 4.3 Check-in / Entwerten — **immer per P2P-Session**

Änderung gegenüber v1 (dort reichte der statische Ticket-QR): Bei
Multi-Location läuft der Check-in grundsätzlich über den kurzen QR-Handshake,
denn der Sync selbst ist der Double-Spend-Schutz:

1. Schüler zeigt Offer-QR → Front-Desk scannt → Verbindung steht (Sekunden).
2. Front-Desk-Gerät zieht die neuesten Heads von `tickets-<studentDid>` —
   inklusive aller Redeems, die andere Locations geschrieben haben und die der
   Schüler als Kurier mitbringt.
3. Verifikation offline: Registry-Signaturprüfung aller Events, Kettenprüfung
   (`seq`/`prevRedeemHash`), Guthaben-Berechnung.
4. „Entwerten" → neues `redeem`-Event mit nächster `seq` → repliziert sofort
   zurück auf das Schülergerät.

Copy-&-Paste-Fallback, falls die Kamera streikt oder der Payload das
QR-Budget (~2200 Zeichen) sprengt.

## 5. Double-Spend: drei Schichten

**Schicht 1 — Schüler als Sync-Kurier (Prävention bei ehrlichen Geräten).**
Das Schülergerät repliziert seinen eigenen Ledger und trägt Redeems physisch
von Location zu Location. Da der Check-in die Heads _vor_ der Entwertung zieht,
sieht Location B die Entwertung von Location A, sobald derselbe Schüler
auftaucht — strukturell, ohne Relay.

**Schicht 2 — Fork-Erkennung (Manipulation nachweisbar).** Monotone `seq` +
`prevRedeemHash` + Gerätesignatur bilden pro Ticket eine Hash-Kette. Wer alte
Stände vorzeigt (lokale DB zurückgesetzt), erzeugt zwangsläufig zwei signierte
Events mit gleicher `seq` — eine Fork, die beim nächsten Sync auffliegt, mit
Signaturen beider Seiten als Beweis. Die App zeigt Forks als roten Alarm mit
Event-Details.

**Schicht 3 — Reconciliation zwischen Locations.** Periodischer Abgleich der
Front-Desk-Geräte per Copy-&-Paste-SDP oder QR (wenn die Inhaberin rotiert):
Austausch der Ledger-Heads aller bekannten Schüler + Registry-Stand
(Geräte-Widerrufe!). Negative Salden werden erkannt und beim nächsten Besuch
nachbelastet. `issuedBy`/`redeemedBy` liefern nebenbei den
**Bar-Kassenabgleich pro Location und Gerät**.

**Ehrliche Grenze (im README dokumentieren):** Prävention gegen einen aktiv
manipulierten Client bei dauerhaft getrennten Locations ist ohne Server oder
Trusted Hardware unlösbar (klassisches Offline-E-Cash-Problem). Für Yogastunden
ist Erkennung + kryptografische Nachweisbarkeit der richtige Trade-off: Schaden
pro Vorfall = eine Stunde.

## 6. Replikation, Sicherheit & Geräteverlust

### 6.1 Replikationsmatrix — wer hält was?

OrbitDB repliziert immer **ganze Datenbanken** (vollständige Logs), keine
Ausschnitte. Die Matrix ist deshalb pro DB entschieden:

| DB                            | Inhaberin                    | Studio-Gerät (Location X)        | Schüler:in             |
| ----------------------------- | ---------------------------- | -------------------------------- | ---------------------- |
| `registry`                    | ✅ Writer                    | ✅ read (voll)                   | ✅ read (voll)         |
| `program` (inkl. `occupancy`) | ✅ Writer                    | ✅ Writer/read (voll)            | ✅ read (voll)         |
| `bookings-<studentDid>`       | ✅ alle (via Reconciliation) | ✅ alle bisher gesehenen Schüler | ✅ **nur die eigene**  |
| `tickets-<studentDid>`        | ✅ alle (via Reconciliation) | ✅ alle bisher gesehenen Schüler | ✅ **nur den eigenen** |

Begründungen: Die `registry` brauchen **alle** vollständig, denn sie ist die
Offline-Verifikationsbasis für Gerätesignaturen und Widerrufe. Studio-Geräte
akkumulieren Buchungen und Ticket-Ledger aller Schüler, die sie je gesehen
haben (plus Reconciliation) — nur so sind Check-in und Terminübersicht an
jeder Location möglich. Schüler halten ausschließlich ihre eigenen Bestände;
fremde erreichen sie nie.

**Der Privacy-Trade-off, der hier stand, ist mit 3.3 entfallen.** Er kam
ausschließlich aus der gemeinsamen Standort-Buchungs-DB. Was bleibt und in
[`PRIVACY.md`](./PRIVACY.md) steht: OrbitDB hat **keine
Lese-Zugriffskontrolle**, nur `canAppend`. Dass ein Schüler fremde Bestände
nicht sieht, ist deshalb eine Verteilungs-Konvention — wer eine Adresse kennt,
kann replizieren. Datensparsamkeit (DID + frei gewählter Alias, Pseudonym
möglich) bleibt Pflicht, nicht Kür.

### 6.2 Geräteverlust — drei Fälle

**Schülergerät verloren.** Kein Ticket-Verlust: Die autoritative Kopie jedes
Schüler-Ledgers liegt ohnehin verteilt auf den Studio-Geräten. Zwei Wege
zurück: (a) Passkey wiederherstellbar (Plattform-Sync oder Recovery-Flow aus
`passkey01`) → gleiche DID, neues Gerät paart sich im Studio, Ledger und
Buchungen replizieren zurück — vollständige Wiederherstellung. (b) DID
unwiederbringlich verloren → neue DID; die Inhaberin prüft die Person
(sie kennt ihre Schüler), schreibt ein `void`-Event auf die alten Tickets und
stellt neue `issue`-Events mit dem Restguthaben auf die neue DID aus
(`payment.method: "transfer"`, Referenz aufs alte Ticket). Ein Dieb kann mit
dem alten Gerät nichts anfangen: Der Schlüssel liegt im
Plattform-Authenticator und ist biometrisch gebunden — genau der Zweck des
WebAuthn-Providers.

**Studio-Gerät verloren.** Sofortmaßnahme: Inhaberin widerruft die
Geräte-DID in der `registry`; ab Kenntnis lehnen alle Geräte dessen Events
ab (Widerrufs-Latenz siehe 6.3). Datenverlust beschränkt sich auf Events
seit dem letzten Sync dieses Geräts — das sind Bareinnahmen-Belege! Deshalb:
Tages-Reconciliation als betriebliche Routine (M5-Screen erinnert daran),
sodass das Verlustfenster maximal ein Tag ist.

**Inhaberinnen-Gerät verloren.** Daten gehen nicht verloren — `registry`,
`program`, Buchungen und Ledger existieren verteilt weiter, der laufende
Betrieb (Verkauf, Entwertung, Buchung) funktioniert ungestört. Verloren ginge
die **Schreibhoheit über die Registry**: Ohne sie kann niemand mehr Geräte
registrieren oder widerrufen. Dreifache Vorsorge, von Tag eins: (1)
Passkey-Recovery-Flow aus `passkey01`, (2) verschlüsselter Registry-Export
(T5.2), (3) **Zweitgerät mit `owner`-Rolle beim Setup registrieren** — der
Onboarding-Wizard fordert dazu aktiv auf. Ohne Vorsorge bliebe nur die
Neugründung der Registry mit Neu-Onboarding aller Geräte (Tickets bleiben
auch dann lesbar und über `void`/Transfer überführbar).

### 6.3 Weitere Sicherheits- und Datenschutzpunkte

- **Replay-Window** fehlt in webrtc-qr (laut README) → upstream eskalieren,
  nicht lokal patchen. Für Tickets irrelevant: Entwertung ist nie token-basiert,
  sondern immer ein verifizierter Ledger-Write.
- **Geräte-Widerruf-Latenz:** Ein widerrufenes Gerät kann bis zum nächsten Sync
  weiter signieren. Redeems widerrufener Geräte werden ab Kenntnis des
  Widerrufs als ungültig markiert; Zeitfenster im README dokumentieren.
- **DSGVO/Datensparsamkeit:** nur DID + selbstgewählter Anzeigename; Beträge/
  Zeitpunkte, keine Adressen. Daten liegen ausschließlich auf beteiligten Geräten.
- **Backup/Recovery:** Passkey-Recovery (`passkey01`); verschlüsselter
  Registry-/Ledger-Export für die Inhaberin. Geräteverlust darf keine Tickets
  vernichten — per-Schüler-Ledger + Replikation auf Studio-Geräten ist hier
  bereits ein natürliches, verteiltes Backup.

### 6.4 Skalierungsgrenzen — Rechnung & Gegenmaßnahmen

Annahmen: ~1–2 KB pro OrbitDB-Entry, aktiver Schüler ~60 Besuche/Jahr,
Buchung = 2 Entries, Replikation remote eher Entry-Rate-begrenzt
(~200–500 Entries/s) als Bandbreiten-begrenzt.

> **Neu gerechnet nach der Entwurfsänderung in 3.3.** Die Tabelle unten stand
> für gemeinsame Standort-Buchungs-DBs — der Engpass, den es so nicht mehr
> gibt. Sie bleibt als Beleg stehen, warum der Zuschnitt pro Schüler auch
> technisch die bessere Wahl war, nicht nur die datenschutzfreundlichere.

**Auf dem Schülergerät ist damit alles unkritisch.** Ein Schüler hält
`registry`, `program` und je eine eigene Buchungs- und Ticket-DB:
zusammen ~190 Einträge pro Jahr, deutlich unter 0,5 MB — nach vier Jahren
immer noch unter 1 MB. Erst-Sync und Cold Start sind damit kein Thema mehr.

**Der verbleibende Engpass ist die _Anzahl_ der DBs auf Studio-Geräten.**
Sie halten pro Schüler jetzt **zwei** kleine DBs statt einer plus Anteil an
einer großen. Bei 1000 Schülern sind das 2000 Datenbanken; bei ~50–200 ms
Öffnungszeit je Instanz ist ein naives „alle öffnen" nicht machbar —
Lazy-Open + LRU ist deshalb keine Optimierung mehr, sondern Voraussetzung.

Die alte Rechnung, die den Zuschnitt erzwungen hat:

| Szenario (alt, gemeinsame Standort-DB) | Bookings-Entries | Größe      | Erst-Sync remote | Cold Start     |
| -------------------------------------- | ---------------- | ---------- | ---------------- | -------------- |
| 100 Schüler, 1 Jahr                    | ~12k             | 12–24 MB   | 25–60 s ⚠️       | ok             |
| 100 Schüler, 3 Jahre                   | ~36k             | 36–72 MB   | 1–3 min ❌       | 10–30 s ⚠️     |
| 500 Schüler, 2 Jahre                   | ~120k            | 120–240 MB | 4–10 min ❌      | Minuten ❌     |
| 1000 Schüler, 4 Jahre                  | ~480k            | 0,5–1 GB   | Stunden ❌       | ❌, Mobile-RAM |

**Gegenmaßnahmen (im Design verankert):**

1. ~~**Jahres-Rotation** der Buchungs-DBs~~ — **entfällt** mit 3.3. Eine
   Schüler-Buchungs-DB wächst um ~0,2 MB pro Jahr; es gibt nichts zu
   rotieren. Falls eine einzelne DB je unhandlich wird, ist Rotation
   nachrüstbar, ohne dass sich der Zuschnitt ändert.
2. **Lazy-Open + LRU** für Buchungs- **und** Ticket-DBs auf Studio-Geräten;
   Guthaben- und Belegungs-Cache mit Head-Hash-Invalidierung, damit weder
   Check-in noch Terminübersicht vom Öffnen aller DBs abhängen. Beide
   Bestände teilen sich dieselbe Mechanik — der Zuschnitt hat die Zahl der
   nötigen Mechanismen nicht erhöht.
3. **Archivierung** abgeschlossener Perioden von Studio-Geräten via
   `orbitdb-storage-bridge` (Export als CAR zu einem austauschbaren
   Speicher-Anbieter), lokal nur Verweis.
4. **`occupancy`-Zähler** (3.3.1) hält Schülergeräte von der Kapazitätsfrage
   fern: ein Dokument pro Kurs und Termin in der ohnehin replizierten
   `program`-DB, statt einer Buchungs-DB, die sie sonst nur zum Zählen
   bräuchten.
5. Alle Zahlen oben sind Schätzungen — die **Benchmarks in Abschnitt 11
   verifizieren sie** gegen Budgets; Budget-Verletzung = Design-Aktion,
   nicht Achselzucken. Die Szenarien messen jetzt die DB-**Anzahl**, nicht
   mehr die Größe einer geteilten DB.

## 7. i18n (DE/EN)

Paraglide-Message-Kataloge, Sprachumschalter + Browser-Detection. Inhaltsdaten
als `{ de, en }`-Objekte mit Fallback. Preise/Daten über `Intl`. Jede neue
UI-Zeichenkette landet ausnahmslos im Katalog (Lint-Regel/CI-Check gegen
hartkodierte Strings).

## 8. Design: Le-Space-Stil, Dark & Bright Mode

### 8.1 Token-Architektur

Ein einziges Set semantischer CSS Custom Properties, Tailwind konsumiert nur
diese Variablen — nie rohe Hex-Werte in Komponenten:

```css
/* src/lib/styles/tokens.css */
:root,
[data-theme='light'] {
	--color-bg: /* aus Le-Space-Referenz */;
	--color-surface: …;
	--color-surface-raised: …;
	--color-text: …;
	--color-text-muted: …;
	--color-accent: …; /* Le-Space-Markenfarbe */
	--color-accent-contrast: …;
	--color-success: …;
	--color-warning: …;
	--color-danger: …;
	--color-border: …;
	--radius-card: …;
	--radius-control: …;
	--shadow-card: …;
	--font-display: …;
	--font-body: …;
	--font-mono: …;
}
[data-theme='dark'] {
	/* dieselben Slots, dunkle Werte */
}
```

```js
// tailwind.config.js (Ausschnitt)
darkMode: ['selector', '[data-theme="dark"]'],
theme: { extend: { colors: {
  bg: 'var(--color-bg)', surface: 'var(--color-surface)',
  accent: 'var(--color-accent)', /* … */ } } }
```

### 8.2 Mode-Umschaltung

Initial `prefers-color-scheme`, manueller Toggle (im Header, neben dem
Sprachumschalter), Wahl persistiert in `localStorage`, gesetzt als
`data-theme` auf `<html>` **vor** dem ersten Paint (Inline-Snippet in
`app.html` gegen Flash-of-wrong-theme). `theme-color`-Meta pro Modus für die
PWA-Statusleiste. `prefers-reduced-motion` respektieren; Fokus-Ringe sichtbar;
Kontrast beider Modi gegen WCAG AA prüfen (axe im E2E-Lauf).

### 8.3 Le-Space-Tokens übernehmen (erste Claude-Code-Aufgabe)

**Kanonische Quelle:** `Le-Space/landing` → `docs/le-space-brand`.

Oben stehen bewusst Slots statt Werte — **Task T0.2** weist Claude Code an,
das Brand-Verzeichnis zu klonen bzw. zu lesen und daraus zu übernehmen:
Farbpalette (hell und dunkel), Typografie (Display/Body/Mono inkl.
Font-Dateien oder Bezugsquelle), Radii, Schatten, Abstände, Logo-/Icon-Assets
und ggf. dort dokumentierte Do's/Don'ts. Alles in `tokens.css` übertragen und
in `docs/DESIGN.md` mit Quellpfad je Wert dokumentieren. Fehlt im
Brand-Verzeichnis eine Dark-Mode-Definition, werden die Dunkel-Werte aus der
hellen Palette abgeleitet (gleiche Hues, angepasste Lightness, AA-Kontrast)
und in `DESIGN.md` explizit als _abgeleitet, nicht Brand-definiert_ markiert
— als Vorschlag zur Rückführung ins Brand-Repo, nicht als lokale Wahrheit.

### 8.4 Gestaltungsrichtung

Ruhig und präzise, passend zu Yoga und zum Le-Space-Purismus: viel Fläche,
klare Typo-Hierarchie, die Akzentfarbe ausschließlich für Aktionen und
Statuswechsel (Buchung bestätigt, Ticket entwertet). Signatur-Element der App:
die **Guthaben-Anzeige des Tickets** — groß, ehrlich, mit „Stand vom …" und
Sync-Indikator; sie ist das Vertrauens-Interface der ganzen Idee. QR-Screens
in beiden Modi mit hellem QR-Feld (Scanbarkeit im Dark Mode!).

## 9. UI-Seiten

**Inhaberin:** Registry (Locations, Geräte, Widerruf) · Programm-Editor ·
Reconciliation-Screen (Abgleich, Kassenbericht pro Location, Fork-Alarme).

**Front-Desk/Lehrer:in:** Buchungsübersicht pro Termin · Kasse („Bar
erhalten") · Check-in-Scanner · Verbindungs-Screen.

**Schüler:in:** Programm/Stundenplan (Filter nach Location) · Buchen/Stornieren ·
Meine Tickets (Guthaben, Gültigkeit, Sync-Status) · Verbindungs-Assistent.

## 10. Repo-Struktur

```
yogasuci/
├── CLAUDE.md                  # Konventionen für Claude Code (s. Abschnitt 12)
├── docs/
│   ├── PLAN.md                # dieses Dokument
│   ├── DESIGN.md              # extrahierte Le-Space-Tokens + Quellen
│   └── LIMITS.md              # Known Limits & Upstream-Eskalationen
├── src/
│   ├── lib/
│   │   ├── p2p/               # libp2p-Setup, webrtc-qr, Paste-Fallback
│   │   ├── db/                # OrbitDB: registry, program, bookings, tickets
│   │   ├── ledger/            # Guthaben-Reducer, Ketten-/Fork-Verifikation
│   │   ├── identity/          # Passkey-DID, Recovery
│   │   ├── styles/tokens.css
│   │   └── components/
│   ├── messages/{de,en}.json  # Paraglide
│   └── routes/
├── e2e/                       # Playwright: alice/, bob/, carol/ Fixtures
├── static/
└── vite.config.js, playwright.config.js, tailwind.config.js, …
```

`ledger/` ist bewusst reines, UI-freies TypeScript mit Unit-Tests: der
Guthaben-Reducer und die Fork-Erkennung sind die kritischste Logik und müssen
ohne Browser testbar sein.

## 11. Meilensteine & Claude-Code-Arbeitspakete

Normales Projekt, normaler Git-Workflow: Feature-Branches pro Task, PR mit
grünen Tests (Unit + E2E) in `main`, `main` ist immer lauffähig. Die
Meilensteine M1–M5 sind reine Planungsstruktur, keine Branches. Statt
Single-Location zuerst und Multi-Location als Umbau danach wird der Ledger
**von Anfang an multi-location-fähig** gebaut — das spart den kompletten
Umbau-Meilenstein. Jede Task ist
so geschnitten, dass sie als einzelner Claude-Code-Auftrag mit prüfbaren
Akzeptanzkriterien funktioniert.

### M1 — Fundament

- **T0.1** Scaffold: SvelteKit static, pnpm, Tailwind, Paraglide, PWA-Shell,
  Playwright-Setup. ✓ `pnpm dev`, `pnpm test` grün, Lighthouse-PWA installierbar.
- **T0.2** Le-Space-Tokens aus `Le-Space/landing:docs/le-space-brand`
  übernehmen → `tokens.css`, `DESIGN.md` (Quellpfad je Wert; abgeleitete
  Dark-Werte markiert), Dark/Light-Toggle ohne Theme-Flash.
  ✓ axe-Kontrastcheck beide Modi; kein Token ohne dokumentierte Quelle.
- **T1.1** Helia + OrbitDB mit LevelBlockstore-Persistenz. ✓ E2E: Reload,
  Daten da.
- **T1.2** Registry- + Programm-DB (Single Writer), Editor-UI für Locations,
  Kurse (offen **und** Kursreihe mit Termin-Generator: Startdatum +
  Wochentage + Wochenzahl → editierbare Session-Liste, Ferien streichbar),
  Pakete (Einzel/Woche/10er/Monat/Jahr, `validityStart`, Verkaufsfenster).
  ✓ E2E: Alice legt 2 Locations, 3 offene Kurse, 1 Reihe (2×/Woche,
  5 Wochen, ein Termin gestrichen), 5 Pakete an; zweisprachig; persistent.

### M2 — Verbindung & Rollen

- **T2.1** libp2p-Node mit `@le-space/libp2p-webrtc-qr` als einzigem Transport;
  Verbindungs-Assistent mit drei Wegen: QR-Kamera, Copy-&-Paste, Teilen per
  Web Share API (Messenger/Social Media). ✓ E2E: Paste-Pfad **und**
  Kamera-Pfad (Fake-Video-Capture, s. E2E-Strategie) verbinden Alice↔Bob.
- **T2.2** Replikation `registry` + `program` → Bob, read-only-Ansicht mit
  Location-Filter. ✓ E2E: Bob sieht Alices Programm; Änderung bei Alice
  erscheint bei bestehender Verbindung live bei Bob.
- **T2.3** Geräte-Onboarding Inhaberin↔Studio-Gerät (Rollen, Widerruf) —
  gleiche QR-Mechanik wie das Schüler-Pairing, deshalb hier statt in einem
  eigenen Meilenstein. ✓ E2E: widerrufenes Gerät wird ab Kenntnis des
  Widerrufs nicht mehr akzeptiert.

### M3 — Buchungen (acl01-Grants)

- **T3.1** acl01-Access-Controller einbinden; Grant-Erteilung beim Pairing,
  Widerruf in der UI. ✓ E2E: Write vor Grant scheitert, nach Grant gelingt,
  nach Widerruf scheitert wieder.
- **T3.2** Buchungs-Flow inkl. Statusregeln und „lokal erfasst / bestätigt"-UI.
  Buchungen liegen in `bookings-<studentDid>` (3.3) — beim Pairing legt das
  Studio-Gerät die DB des Schülers an bzw. öffnet sie und trägt sich als
  Writer ein. Kursreihen werden **als Ganzes** gebucht (eine Buchung = alle
  Sessions, Kapazität zählt pro Reihe); offene Stunden pro Termin, bei Reihen
  mit `allowDropIn` auch einzelne Sessions.
  ✓ E2E bidirektional: Bob bucht, Alice bestätigt, Bob storniert; Bob bucht
  eine Reihe komplett und eine fremde Reihen-Session als Drop-in.
  ✓ E2E Privacy-Grenze: Carol bucht ebenfalls; Bobs Gerät repliziert Carols
  Buchung **nicht** und kennt ihre DB-Adresse nicht. Dieser Test ist der
  Beleg für die Entwurfsänderung in 3.3 und darf nicht gestrichen werden.
- **T3.3** `occupancy`-Zähler (3.3.1): Studio-Geräte schreiben die
  bestätigten Plätze pro Kurs und Termin in die `program`-DB, Schülergeräte
  zeigen „noch N Plätze frei" daraus. ✓ E2E: Alice bestätigt eine Buchung,
  der Zähler bei Bob steigt, ohne dass Bob eine fremde Buchung sieht;
  Überbuchung wird beim Bestätigen abgelehnt, nicht beim Anfragen.

**Offen aus T3.2**, bewusst nicht stillschweigend übergangen: Kursreihen
werden gebucht (`date: null`) und zählen als **eine** Buchung gegen die
Kapazität der Reihe, aber `allowDropIn` — der Besuch eines einzelnen
Reihentermins per Karte — ist noch nicht umgesetzt. Dafür fehlt eine
Terminauswahl in der UI; die Datenseite trägt es bereits (`date` je Buchung).

### M4 — Ticket-Ledger (von Anfang an multi-location-fähig)

Zusammengelegt aus alt-M4 und dem Kern von alt-M6: Der Ledger wird gleich
richtig gebaut — pro Schüler, Multi-Writer für registrierte Studio-Geräte,
Hash-Kette und Fork-Erkennung von Tag eins. Kein Umbau-Meilenstein mehr.

- **T4.1** `ledger/`-Modul: Event-Typen (`issue`/`redeem`/`void`),
  Guthaben-Reducer, Signatur- und
  Kettenprüfung (`seq`/`prevRedeemHash`), Fork-Erkennung, Gültigkeits-
  Validierung (Ticket-Fenster, `validityStart: firstRedeem` — Fenster startet
  mit der ersten Entwertung —, Kursbindung via `courseId`). ✓ Unit inkl.
  Property-Tests: Reihenfolge-Invarianz, identisches Ergebnis bei mehreren
  Writern, Fork-Fälle deterministisch erkannt; Tabellen-Tests für alle
  Gültigkeits-Kombinationen (vor Fenster, im Fenster, danach, falscher Kurs).
- **T4.2** Barkauf-Flow („Bar erhalten") + Ticket-UI mit Guthaben-Signatur-
  Element. ✓ E2E: Kauf → Guthaben auf beiden Geräten korrekt.
- **T4.3** Check-in per P2P-Session mit Kurier-Sync (Heads vor Entwertung
  ziehen → verifizieren → redeem → zurückreplizieren). ✓ E2E-Roundtrip mit
  drei Kontexten: Kauf bei A → Entwertung bei A → Bob zu B → B sieht
  korrektes Guthaben → Entwertung bei B → zurück zu A → beide Redeems
  sichtbar. Abgelaufen/fremd abgelehnt; Zeitkarten (units:null) ohne Abzug;
  Reihen-Ticket: Anwesenheit protokolliert ohne Abzug, Entwertung für
  fremden Kurs abgelehnt; `firstRedeem`-Karte startet ihr Fenster mit der
  ersten Entwertung (page.clock).
- **T4.4** Fork-Alarm-UI. ✓ E2E (`m4-tickets.spec.js`, „two counters redeeming
  the same position raise a fork alarm"): Carol trennt die Verbindung, beide
  Theken entwerten Kettenposition 1, der Schüler trägt den Widerspruch zusammen ⇒
  Alarm mit beiden signierten Events, je Ort und Gerät, und Guthaben 9 statt 8
  (ein Fork kostet genau eine Einheit). Nichts daran ist gestellt: der Fork
  entsteht aus zwei echten Theken, die sich nicht sehen.

### M5 — Hardening & Reconciliation

- **T5.1** Sync-Status-UI überall („Stand vom …"), Konfliktfälle
  (Storno nach Entwertung u. ä.).
- **T5.2** Ledger-/Registry-Export, Passkey-Recovery-E2E,
  Geräteverlust-Flows: Schüler-Restore auf neues Gerät (gleiche DID),
  DID-Verlust mit `void`+Transfer auf neue DID, Studio-Gerät-Widerruf;
  Setup-Wizard fordert Owner-Zweitgerät aktiv ein.
- **T5.3** Reconciliation-Screen + Kassenbericht pro Location/Gerät.
  ✓ E2E (`m5-report.spec.js`): Einnahmen nach Location und Gerät, Abgleich
  ausschließlich über den Kurier (A↔B ohne Server). Zum **negativen Saldo**: Er
  ist über die Oberfläche nicht erzeugbar — der Check-in weist bei leerem
  Guthaben ab, und zwei rennende Theken erzeugen einen Fork, der genau eine
  Einheit kostet. Die Nachbelastungs-Rechnung existiert für Ledger, die nicht von
  diesen Schirmen stammen (§1.9), und ist per Unit-Test belegt. Was der Bericht
  stattdessen zeigt: **strittige** Check-ins je Theke.
- **T5.4** `LIMITS.md` + Upstream-Issues formulieren.
- **T5.5** Benchmark-Suite `bench/`: Seed-Generator, Szenarien S1–S6
  (S7 Stretch), Metriken + Budgets, Lazy-Open/LRU + Guthaben-Cache
  implementieren und je Szenario mit/ohne Gegenmaßnahmen messen; Remote-Lauf
  über den Harness aus relay-button bzw. simple-todos
  `remote-replication.yml`. ✓ Budgets für S1–S6 grün, Report generiert
  (`bench/report.md`); Lazy-Open/LRU umgesetzt (`src/lib/db/lru.js`). Offen und
  in `LIMITS.md` §3 als solches ausgewiesen: Cold Start, Erst-Pairing und
  Check-in-Sync brauchen einen Browser-Harness, der Remote-Lauf steht aus.

### E2E-Teststrategie (Playwright)

**Infrastruktur (Teil von T0.1, wächst mit jedem Meilenstein):**

- **Fixtures:** `e2e/fixtures.ts` stellt benannte Browser-Kontexte bereit —
  `alice` (Inhaberin/Location A), `carol` (Front-Desk Location B), `bob`
  (Schüler/Kurier). Jeder Kontext bekommt isolierte IndexedDB/Storage-Partition
  und eine eigene Passkey-Identität über den WebAuthn-Emulator (s. u.) —
  echte Passkey-Flows, keine Test-Modus-Abkürzung im Identity-Provider.
- **WebAuthn-Emulator:** Wiederverwendung des Emulators aus den E2E-Tests von
  `Le-Space/orbitdb-identity-provider-webauthn-did` (CDP Virtual
  Authenticator). Erste Aufgabe in T0.1: den Helper dort lokalisieren und als
  `e2e/webauthn.ts` übernehmen bzw. direkt importieren, falls das Repo ihn
  exportiert — exportiert es ihn nicht, Export upstream vorschlagen statt
  Code zu duplizieren.
- **Kamera-Emulation:** Chromium-Flags `--use-fake-ui-for-media-stream`,
  `--use-fake-device-for-media-stream`,
  `--use-file-for-fake-video-capture=<datei>.y4m|.mjpeg`. Der Test rendert
  den Offer-QR in Kontext A, schreibt den Frame als Fake-Kamera-Datei und
  startet Kontext B mit dieser „Kamera" → der **echte Scan-Pfad** (Decoder
  inklusive) läuft in CI. `docs/TESTING.md` behält nur noch eine kurze
  Checkliste für echte Geräte (Fokus, Abstand, Display-Helligkeit).
- **Handshake-Helper:** `connectViaPaste(a, b)` (Copy-&-Paste-Automation,
  schneller Default für die Masse der Tests) und `connectViaCamera(a, b)`
  (Fake-Video-Pfad, mindestens je ein Szenario pro Meilenstein). Beide mit
  `?ice=host` wie in der webrtc-qr-Suite. Der Share-Flow (Web Share API) wird
  mit gestubbtem `navigator.share` getestet: Payload-Inhalt und Fallback auf
  Copy-&-Paste, wenn `share` nicht verfügbar ist.
- **Zeit:** `page.clock` für Gültigkeits-Szenarien (abgelaufene Karten,
  Zeitkarten-Fenster) — keine echten Wartezeiten, keine flaky Datumslogik.
- **Selektoren:** ausschließlich `data-testid`; i18n-Texte sind nie
  Selektoren (beide Sprachen müssen denselben Test bestehen).
- **Projekt-Matrix:** Chromium als Pflicht-Gate; Firefox/WebKit als
  `continue-on-error`-Jobs, bis der Transport upstream dort getestet ist.
- **a11y:** axe-Check (beide Themes) als eigener Spec, Teil des Gates.

**Szenario-Katalog (Spec-Dateien, kumulativ pro Meilenstein):**

| Spec                     | Kontexte          | Kernszenarien                                                                                                                                                                                                  |
| ------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `m1-program.spec`        | alice             | Locations/Kurse/Pakete CRUD, Reihen-Editor (Termin-Generator, Termin streichen), DE↔EN, Reload-Persistenz, Theme-Toggle ohne Flash                                                                             |
| `m2-connect.spec`        | alice, carol, bob | Paste- **und** Kamera-Handshake, Share-Flow (gestubbt) inkl. Fallback, Programm-Replikation, Live-Update, Geräte-Onboarding + Widerruf, Abbruch/Retry                                                          |
| `m3-booking.spec`        | alice, carol, bob | Write vor/nach Grant/Widerruf, Buchen→Bestätigen→Stornieren, Reihe als Ganzes + Drop-in-Session, „lokal erfasst"-Status offline, **Bob sieht Carols Buchung nicht**, `occupancy`-Zähler steigt ohne Fremddaten |
| `m4-tickets.spec`        | alice, carol, bob | Barkauf, Kurier-Roundtrip A→B→A, abgelaufen/fremd/falscher-Kurs abgelehnt, Zeitkarte & Reihen-Ticket ohne Abzug, firstRedeem-Fensterstart, Fork-Alarm mit Beweis-Events                                        |
| `m5-recovery.spec`       | alice, bob        | Export/Import, Passkey-Recovery (WebAuthn-Emulator), Schüler-Restore gleiche DID, `void`+Transfer auf neue DID, Storno-nach-Entwertung-Konflikt                                                                |
| `m5-reconciliation.spec` | alice, carol      | A↔B-Abgleich, Nachbelastung, Kassenbericht pro Location/Gerät                                                                                                                                                  |
| `a11y.spec`              | alice             | axe in Light + Dark auf allen Hauptscreens                                                                                                                                                                     |

**CI (GitHub Actions):** PR-Gate = Lint + vitest (Ledger-Property-Tests) +
Chromium-E2E + axe; Playwright-Traces/Screenshots als Artefakte bei Failure.
Nightly zusätzlich Firefox/WebKit (non-blocking) als Frühwarnung.

### Benchmarks & Skalierungs-Verifikation

Die Schätzungen aus 6.4 werden gemessen, nicht geglaubt. Eigene Suite in
`bench/`, getrennt vom PR-Gate (langlaufend → nightly/weekly).

**Seed-Generator (`bench/seed.ts`, Node):** erzeugt deterministisch (Seed-RNG)
komplette OrbitDB-Datenbestände für ein Szenario — N Schüler, Y Jahre,
Besuchsverteilung, L Locations, inkl. Ledger-Ketten und Buchungs-DBs — und
exportiert sie als ladbare Fixtures. Kein Klick-Seeding durch die UI.

**Szenarien:**

| #            | Schüler | Jahre         | prüft primär                         |
| ------------ | ------- | ------------- | ------------------------------------ |
| S1–S4        | 100     | 1 / 2 / 3 / 4 | Wachstum über Zeit, Rotations-Effekt |
| S5           | 500     | 2             | Erst-Pairing, Cold Start             |
| S6           | 1000    | 2             | Reconciliation-DB-Anzahl, RAM        |
| S7 (Stretch) | 1000    | 4             | Archivierungspfad, Rotation Pflicht  |

Jedes Szenario läuft einmal **mit** und einmal **ohne** Rotation/Lazy-Open,
damit der Effekt der Gegenmaßnahmen belegt ist.

**Metriken:** Cold Start (DB-Load bis interaktiv) + Peak-RAM · Erst-Pairing
eines neuen Schülers (Entries/s, Gesamtzeit) · inkrementeller Check-in-Sync ·
Reconciliation-Dauer für N Ledger · Storage-Footprint pro Rolle.

**Budgets (Fail = Design-Aktion, in `LIMITS.md` protokolliert):**
Check-in-Sync < 3 s · Cold Start < 5 s · Erst-Pairing < 15 s ·
Reconciliation (100 Schüler) < 60 s.

**Lokal vs. Remote:** Baseline lokal (Playwright, `connectViaPaste`,
`?ice=host`). Zusätzlich **Remote-Replikation über echte Netze/NATs**: dafür
den bestehenden Remote-Harness wiederverwenden — Claude Code prüft zuerst das
**relay-button-Repo** (deckt Remote-Replikation ab, Aussage Nico; von hier
nicht einsehbar) und als bekannte Referenz die
`remote-replication.yml`/TestingBot-Suite aus `simple-todo`. Wichtig für die
Einordnung: Der Harness orchestriert entfernte Browser; der SDP-Austausch der
App bleibt Paste/QR (Testrunner überträgt den SDP-Text) — die App bleibt
relay-frei. Läuft ein Szenario zusätzlich über Relay-Infrastruktur aus
relay-button, wird es explizit als „mit Relay" gelabelt und getrennt
berichtet, damit die relay-freien Zahlen sauber bleiben.

**Reporting:** JSON-Resultate als CI-Artefakte + einfacher Trend über
Commits (`bench/report.md` generiert), damit Regressionen auffallen, bevor
ein Studio sie spürt.

## 12. CLAUDE.md (Entwurf — ins Repo-Root)

Umgesetzt in [`../CLAUDE.md`](../CLAUDE.md). Abweichungen gegenüber dem
Entwurf sind dort begründet und in [`LIMITS.md`](./LIMITS.md) belegt.

## 13. Upstream-Lücken (dokumentieren & eskalieren)

Replay-Window + kleinerer Payload (QWBP-Richtung) in `libp2p-webrtc-qr` ·
vendored `@libp2p/webrtc`-Internals · Firefox/WebKit · TURN-lose NAT-Fälle ·
Feld-Level-Rechte in OrbitDB-ACLs.

## 14. Bewusst verschoben (v2+)

PayPal/Bitcoin/Lastschrift (`payment.method`-Enum vorbereitet) · Wartelisten ·
mehrere Studios pro Schüler-App · Push-Erinnerungen · Multi-Frame-QR (BC-UR)
als Fallback für große Payloads.

---

_Hinweis Förderung: Falls Teile hiervon ein Arbeitspaket für NLnet/BayTP+
werden sollen, das Work Package vor Entwicklungsbeginn abgrenzen
(Vorhabensbeginn)._
