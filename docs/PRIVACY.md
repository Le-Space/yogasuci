# PRIVACY.md — personenbezogene Daten und Metadaten

Vollständige Aufstellung dessen, was diese App speichert und repliziert, wer es
sehen kann, und was Verschlüsselung daran ändern würde.

Grundlage: DSGVO Art. 4 Nr. 1 — personenbezogen ist **jede** Information, die
sich auf eine identifizierte oder **identifizierbare** Person bezieht.
Pseudonyme Kennungen (DIDs, PeerIds) sind damit personenbezogen, sobald sie
einer Person zugeordnet werden können; im Studio ist genau das der Fall, weil
die Inhaberin ihre Schüler kennt.

---

## 1. Die Ausgangsfrage, präzise beantwortet

> „Wir haben u. U. ein Privacy-Problem mit unserem Ledger, wenn andere Schüler
> den Ledger auch replizieren."

Drei Aussagen, die auseinandergehalten werden müssen:

**a) Laut Entwurf repliziert kein Schüler einen fremden Ticket-Ledger.**
`tickets-<studentDid>` liegt beim betreffenden Schüler und auf Studio-Geräten
(`docs/PLAN.md` §6.1). Fremde Ledger erreichen ein Schülergerät nie — es
bekommt ihre Adressen gar nicht.

**b) Das ist eine Konvention, keine technische Garantie.** OrbitDB hat
**keine Lese-Zugriffskontrolle**. Der Access Controller regelt ausschließlich
`canAppend`, also Schreibrechte. Wer eine Datenbankadresse kennt und einen
Peer erreicht, der sie hat, kann sie vollständig replizieren und lesen. Die
Adresse ist damit faktisch das Geheimnis — und Adressen sind kein Geheimnis
im kryptografischen Sinn: sie stehen auf Studio-Geräten, in `localStorage`
und potenziell in Pairing-Payloads.

**c) Das tatsächlich by-design offene Problem war ein anderes:** die
Buchungs-DB. Schüler bekamen Write-Grants auf `bookings-<location>-<jahr>`
und replizierten sie **vollständig** — inklusive der Buchungen aller anderen.
Wer buchte, sah, wer sonst noch in dieser Stunde ist. Das war keine Lücke,
sondern die direkte Folge davon, dass OrbitDB ganze Logs repliziert.

> **Behoben am 2026-07-29.** Der Entwurf ist auf **eine Buchungs-DB pro
> Schüler** umgestellt (`docs/PLAN.md` §3.3), exakt nach dem Muster des
> Ticket-Ledgers. Damit verteilt die App keine fremden personenbezogenen
> Daten mehr an Schüler. Ersatz für die verlorene gemeinsame Sicht ist der
> `occupancy`-Zähler (§3.3.1): reine Zahlen pro Kurs und Termin in der
> ohnehin replizierten `program`-DB — „noch 4 Plätze frei", ohne dass jemand
> erfährt, **wer** die anderen acht sind.
>
> Die Aufstellung in §2.3 beschreibt weiterhin, **welche** Felder anfallen;
> die Spalte „andere Schüler" steht dort jetzt auf ❌. Der Abschnitt bleibt,
> weil die Daten weiterhin existieren — nur eben nicht mehr bei Mitschülern.

Kurz: Der Ledger bleibt das kleinere Risiko (Konvention + Adresskenntnis).
Das größere ist mit dem Zuschnitt entfallen — strukturell, nicht durch
Kryptografie.

---

## 2. Aufstellung: Nutzdaten

Legende Sichtbarkeit — **I** Inhaberin · **S** Studio-Geräte · **E** eigener
Schüler · **A** andere Schüler.

### 2.1 `registry` (§3.1)

| Feld                             | Inhalt                        | personenbezogen                                        | I   | S   | E   | A   |
| -------------------------------- | ----------------------------- | ------------------------------------------------------ | --- | --- | --- | --- |
| `studio.name`                    | Name des Studios              | nein (Unternehmen)                                     | ✅  | ✅  | ✅  | ✅  |
| `studio.ownerDid`                | DID der Inhaberin             | **ja**                                                 | ✅  | ✅  | ✅  | ✅  |
| `location.name`, `.address`      | Standort, Anschrift           | nein (Geschäftsadresse)                                | ✅  | ✅  | ✅  | ✅  |
| `device.deviceDid`               | DID eines Studio-Geräts       | **ja** (Gerät ↔ Mitarbeiter:in)                        | ✅  | ✅  | ✅  | ✅  |
| `device.label`                   | z. B. „iPad Empfang Altstadt" | **möglich** — frei getippt, kann einen Namen enthalten | ✅  | ✅  | ✅  | ✅  |
| `device.role`, `.locationId`     | Rolle, Zuordnung              | **ja** (Arbeitsort)                                    | ✅  | ✅  | ✅  | ✅  |
| `device.grantedAt`, `.revokedAt` | Zeitpunkte                    | **ja** (Beschäftigungsverlauf)                         | ✅  | ✅  | ✅  | ✅  |

Die Registry ist **absichtlich für alle vollständig lesbar**: sie ist die
Offline-Verifikationsbasis für Gerätesignaturen und Widerrufe. Ein Gerät, das
sie nicht lesen kann, kann ein gesperrtes Gerät nicht von einem gültigen
unterscheiden. Verschlüsselung ist hier deshalb **keine Option** — wohl aber
Datensparsamkeit bei `device.label` (Gerät benennen, nicht Person).

`device.grantedAt`/`revokedAt` bilden nebenbei einen groben
**Beschäftigungsverlauf** ab. Für eine Mitarbeiterin ist das erkennbar mehr
als „ein Gerät wurde registriert".

### 2.2 `program` (§3.2)

Enthält **keine** personenbezogenen Daten: Kurse, Zeiten, Kapazitäten, Preise.
Der einzige Grenzfall ist ein Kurstitel, der eine Lehrerin namentlich nennt
(„Yin mit Maria") — Konvention: keine Namen in Kurstiteln, Lehrerzuordnung
später über die Registry.

### 2.3 `bookings-<location>-<jahr>` (§3.3) — der kritische Bestand

| Feld                | Inhalt                        | personenbezogen             | I   | S   | E   | A         |
| ------------------- | ----------------------------- | --------------------------- | --- | --- | --- | --------- |
| `studentDid`        | DID des Schülers              | **ja**                      | ✅  | ✅  | ✅  | ⚠️ **ja** |
| Anzeigename / Alias | selbstgewählt                 | **ja**                      | ✅  | ✅  | ✅  | ⚠️ **ja** |
| `courseId`, `date`  | welche Stunde, wann           | **ja** — Anwesenheitsprofil | ✅  | ✅  | ✅  | ⚠️ **ja** |
| Status              | requested/confirmed/cancelled | **ja**                      | ✅  | ✅  | ✅  | ⚠️ **ja** |

Aus `studentDid` + `courseId` + `date` über eine Saison entsteht ein
**Bewegungs- und Anwesenheitsprofil**: wer wann wo regelmäßig ist. In einer
Kleinstadt ist die Re-Identifikation über ein solches Muster trivial, auch bei
Pseudonym. Das ist der schwerwiegendste Punkt dieses Dokuments.

Ein Yogakurs kann zudem auf **Gesundheitsdaten** (DSGVO Art. 9) hindeuten —
ein Rückbildungskurs, ein Reha- oder Präventionskurs sagt etwas über den
Gesundheitszustand aus. Sobald solche Kurse im Programm stehen, ist die
Buchungsliste eine besondere Kategorie personenbezogener Daten, und die
Voll-Replikation an Mitschüler ist dann nicht mehr vertretbar.

### 2.4 `tickets-<studentDid>` (§3.4)

| Feld                                          | Inhalt                          | personenbezogen                                   | I   | S   | E   | A    |
| --------------------------------------------- | ------------------------------- | ------------------------------------------------- | --- | --- | --- | ---- |
| `studentDid`                                  | DID                             | **ja**                                            | ✅  | ✅  | ✅  | ❌ ¹ |
| `payment.amountEUR`, `.method`, `.receivedAt` | Kaufbetrag, Zeitpunkt           | **ja** — Finanzdatum                              | ✅  | ✅  | ✅  | ❌ ¹ |
| `issuedBy`, `redeemedBy`                      | Gerät + Standort                | **ja** (beidseitig: Schüler _und_ Mitarbeiter:in) | ✅  | ✅  | ✅  | ❌ ¹ |
| `redeem.courseId`, `.date`                    | jeder einzelne Besuch           | **ja** — vollständiges Anwesenheitsprotokoll      | ✅  | ✅  | ✅  | ❌ ¹ |
| `void.reason`                                 | refund / transfer / lost-device | **ja**                                            | ✅  | ✅  | ✅  | ❌ ¹ |

¹ Nur solange die Adresse unbekannt bleibt — siehe §1b. Das ist eine
Zugangs-, keine Zugriffskontrolle.

Der Ledger ist inhaltlich **sensibler** als die Buchungs-DB (er enthält
Zahlungen und jeden einzelnen Besuch), aber deutlich **enger verteilt**.

---

## 3. Aufstellung: Metadaten

Diese Daten stehen in keinem Schema und werden trotzdem repliziert oder
beobachtet. Sie sind der Teil, den Payload-Verschlüsselung **nicht** entfernt.

### 3.1 In jedem OrbitDB-Eintrag

Verifiziert an `@orbitdb/core` (`src/oplog/entry.js`, `src/oplog/log.js`):

| Feld                  | Inhalt                                                    | von Payload-Verschlüsselung erfasst? |
| --------------------- | --------------------------------------------------------- | ------------------------------------ |
| `entry.identity`      | Hash der Identität des Schreibers → auflösbar auf die DID | **nein**                             |
| `entry.key`           | öffentlicher Schlüssel des Schreibers                     | **nein**                             |
| `entry.clock`         | Lamport-Zähler, ID = Public Key des Schreibers            | **nein**                             |
| `entry.next`, `.refs` | Log-Struktur: wie viele Einträge, in welcher Reihenfolge  | **nein**                             |
| `entry.hash` / CID    | Identifikator jedes Eintrags                              | **nein**                             |
| `entry.payload`       | die eigentlichen Nutzdaten                                | **ja**                               |

Konsequenz: Mit `encryption.data` bleibt sichtbar, **wer wie oft und in
welcher Reihenfolge** geschrieben hat — nur nicht mehr, _was_. Bei einem
Ticket-Ledger heißt das: die Anzahl der Besuche und ihre Reihenfolge bleiben
ablesbar, Kurs und Datum nicht.

`entry.identity` ist dabei kein Nebeneffekt, sondern tragend: Die
Ledger-Sicherheit beruht darauf, dass jedes Event einem registrierten Gerät
zugeordnet werden kann. Wer diese Zuordnung verschlüsselt, verliert die
Fork-Erkennung.

### 3.2 Auf Netzwerkebene

| Datum                        | Inhalt                                | wer sieht es                                                                   |
| ---------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| libp2p **PeerId**            | stabiler Knoten-Identifikator         | jeder verbundene Peer                                                          |
| **IP-Adresse**               | über ICE-Kandidaten im SDP            | der Peer am anderen Ende **und** jeder, durch dessen Hände der Offer-Text geht |
| **STUN-Abfrage**             | IP + ungefährer Zeitpunkt der Nutzung | der STUN-Betreiber (Default: Google, Cloudflare)                               |
| **Zeitpunkt der Verbindung** | wann jemand im Studio war             | beide Seiten                                                                   |

Der SDP-Payload ist hier der unterschätzte Punkt: Er enthält **lokale und
öffentliche IP-Adressen**. Wird er per Messenger geteilt (§4.2 „Remote-Pfad"),
landet die IP-Adresse des Geräts beim Messenger-Betreiber und in jedem Chat,
durch den der Text weitergereicht wird. Das ist bei WhatsApp oder E-Mail eine
Weitergabe an Dritte.

Gegenmaßnahme, verfügbar: `?ice=host` verzichtet auf STUN und damit auf die
öffentliche Adresse (funktioniert dann nur im selben Netz — im Studio also
gerade der Normalfall).

### 3.3 Auf dem Gerät

| Datum                    | Ort                                       | Hinweis                                                                                                                        |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| WebAuthn-Credential      | `localStorage`                            | enthält Credential-ID und Public Key, **nicht** den privaten Schlüssel — der bleibt im Plattform-Authenticator                 |
| `userId` / `displayName` | im Passkey und im Authenticator           | wird beim Anlegen frei gewählt; eine E-Mail-Adresse hier ist eine bewusste Entscheidung, keine Notwendigkeit                   |
| Datenbankadressen        | `localStorage`                            | siehe §1b — wer sie liest, kann replizieren                                                                                    |
| Blockstore / Datastore   | IndexedDB                                 | vollständige Logs, unverschlüsselt at rest                                                                                     |
| OrbitDB-Signierschlüssel | IndexedDB (`level-js-orbitdb/identities`) | unverschlüsselt at rest; aus dem PRF des Passkeys abgeleitet, ohne PRF erzeugt. Wer ihn liest, kann als dieses Gerät signieren |

**IndexedDB ist unverschlüsselt.** Wer physischen Zugriff auf ein
entsperrtes Studio-Gerät hat, liest alle Ledger aller je gesehenen Schüler —
ohne Passkey, ohne Signaturprüfung. Für das Front-Desk-iPad ist das der
realistischste Angriffsweg, nicht das Netzwerk.

---

## 4. Was Verschlüsselung leisten kann — und was nicht

`@orbitdb/core` unterstützt Verschlüsselung nativ über die `encryption`-Option
von `orbitdb.open`, in zwei Ebenen:

- **`encryption.data`** — verschlüsselt `entry.payload`. Log-Struktur,
  Schreiber-Identität und Reihenfolge bleiben sichtbar (§3.1).
- **`encryption.replication`** — verschlüsselt den kodierten Eintrag als
  Ganzes. Deutlich mehr wird verborgen; dafür braucht **jeder** Peer, der
  synchronisieren soll, den Schlüssel.

Der Schlüssel kann per **WebAuthn PRF** an den Passkey gebunden werden. Die
Bausteine liegen bereits in unserer gepinnten Abhängigkeit
`@le-space/orbitdb-identity-provider-webauthn-did@0.3.1` bereit:
`generateSecretKey`, `wrapSKWithPRF`, `unwrapSKWithPRF`. Referenz-Integration:
[`NiKrause/de2do`](https://github.com/NiKrause/de2do) →
`src/lib/encryption/webauthn-encryption.js` (SK erzeugen, mit PRF wrappen, in
`localStorage` ablegen, beim Start entpacken).

### Der Haken, der hier entscheidet

PRF bindet den Schlüssel an **einen** Passkey. Genau das ist für einen
Ticket-Ledger falsch: Er ist **Multi-Writer** — jedes registrierte Studio-Gerät
muss ihn lesen und schreiben können, an jeder Location. Ein an Alices Passkey
gebundener Schlüssel wäre auf Carols Front-Desk-Gerät wertlos.

Nutzbar ist PRF-Verschlüsselung deshalb dort, wo genau eine Identität liest:

| Bestand                  | PRF-Verschlüsselung sinnvoll?                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `registry`               | **nein** — muss für alle offline lesbar sein, sonst keine Widerrufsprüfung                                                |
| `program`                | nein — keine personenbezogenen Daten                                                                                      |
| `bookings-<loc>`         | **nein, so nicht** — viele Schreiber und Leser; hier hilft nur ein anderer Zuschnitt (§5)                                 |
| `tickets-<studentDid>`   | **teilweise** — nur, wenn der Schlüssel zwischen Schüler und Studio-Geräten geteilt wird, nicht an einen Passkey gebunden |
| **Export/Backup** (T5.2) | **ja, uneingeschränkt** — genau ein Leser, die Inhaberin                                                                  |

Für Multi-Writer-Bestände wäre die richtige Konstruktion ein pro-Datenbank
**Content-Key**, der für jede berechtigte DID einzeln gewrappt wird (klassisches
Envelope-Verfahren) — mit Neu-Wrapping bei jedem Grant und, härter, einem
Key-Rotation-Problem bei jedem Widerruf. Das ist ein eigenes Arbeitspaket, kein
Konfigurationsschalter.

---

## 5. Empfehlung

Nach Wirkung sortiert, nicht nach Aufwand:

1. **Buchungs-DB pro Schüler zuschneiden statt verschlüsseln.**
   `bookings-<location>-<jahr>` an Mitschüler zu replizieren ist die einzige
   Stelle, an der die App systematisch fremde personenbezogene Daten verteilt.
   Eine Buchungs-DB pro Schüler (Schreibrecht: Schüler + Studio-Geräte) löst
   das strukturell — kein Schlüsselmanagement, kein Rotationsproblem. Kosten:
   Die Kapazitätszählung pro Termin muss dann auf Studio-Geräten passieren,
   nicht auf dem Schülergerät. **Das ist der Vorschlag.**
2. **Datensparsamkeit sofort**: Alias statt Klarname, keine E-Mail als
   `userId`, `device.label` benennt das Gerät und nicht die Person, keine
   Lehrerinnennamen in Kurstiteln.
3. **Consent-Text ehrlich**: Vor der ersten Buchung muss dastehen, wer welche
   Buchungen sehen kann — solange Punkt 1 nicht umgesetzt ist.
4. **Export/Backup mit PRF verschlüsseln** (T5.2). Genau ein Leser, kein
   Verteilproblem — hier ist die de2do-Integration direkt übernehmbar.
5. **`?ice=host` als Default im Studio**, STUN nur für den Remote-Pfad. Der
   SDP-Payload trägt IP-Adressen; im Studio braucht es sie nicht.
6. **Gesundheitsbezogene Kurse** (Reha, Rückbildung, Prävention) markieren und
   ihre Buchungen nie in eine geteilte DB legen — auch dann nicht, wenn
   Punkt 1 aus Aufwandsgründen zurückgestellt wird.

Nicht empfohlen: `encryption.data` auf den Ticket-Ledger als schnelle Lösung.
Es verbirgt Kurs und Datum, lässt Anzahl und Reihenfolge der Besuche sichtbar,
und erkauft das mit einem Schlüsselverteilungsproblem über alle Studio-Geräte
hinweg — schlechtes Verhältnis.

---

## 6. Offene Punkte

- **Kein Löschkonzept.** Append-only und DSGVO Art. 17 (Recht auf Löschung)
  vertragen sich nicht ohne Weiteres. Ein `void`-Event beendet ein Ticket,
  löscht aber nichts. Realistischer Weg: Krypto-Löschung (Schlüssel vernichten)
  — setzt Verschlüsselung voraus — oder eine dokumentierte Aufbewahrungsfrist
  mit Rotation und echtem Verwerfen alter Perioden.
- **Auftragsverarbeitung.** Es gibt keinen Server und damit keinen
  Auftragsverarbeiter; die Studio-Geräte sind Verantwortliche. Das ist
  datenschutzrechtlich eher einfacher — aber die Schülergeräte, die fremde
  Buchungen replizieren, sind es dann eben auch. Noch nicht bewertet.
- **Verzeichnis von Verarbeitungstätigkeiten** (Art. 30) existiert nicht;
  dieses Dokument ist die Vorarbeit dafür, nicht der Ersatz.
- Nichts hiervon ist Rechtsberatung.
