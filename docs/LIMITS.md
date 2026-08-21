# LIMITS.md — bekannte Grenzen und Upstream-Fragen

Was diese App nicht kann, und warum. Nichts hiervon wird lokal gepatcht oder
gevendort (siehe `CLAUDE.md`); jeder Punkt ist entweder eine bewusste
Entwurfsgrenze oder eine Upstream-Frage.

## 1. Entwurfsgrenzen

### 1.1 Double-Spend bei dauerhaft getrennten Locations

Prävention gegen einen aktiv manipulierten Client ist ohne Server oder Trusted
Hardware unlösbar — das klassische Offline-E-Cash-Problem. Diese App setzt auf
**Erkennung statt Verhinderung**: monotone `seq` + `prevRedeemHash` +
Gerätesignatur machen jeden zurückgesetzten Ledger beim nächsten Sync als Fork
sichtbar, mit beiden signierten Events als Beweis.

Der Schaden pro Vorfall ist eine Yogastunde. Der Reducer ist zusätzlich so
gebaut, dass ein mehrdeutiger Log nie Guthaben _erzeugt_: ein Fork verbraucht
genau eine Einheit, eine fehlende Kettenposition ebenfalls.

### 1.2 Zwei Dinge, die wie Infrastruktur aussehen und keine sind

**gossipsub.** OrbitDB verteilt seine Log-Heads über `libp2p.services.pubsub`;
ohne pubsub repliziert nichts. Gossipsub läuft hier ausschließlich innerhalb
der direkten, per QR ausgehandelten WebRTC-Verbindung. Kein Broker, kein
Rendezvous, keine Peer-Discovery (`pubsubPeerDiscovery` ist bewusst nicht
eingebunden).

**STUN.** Ohne STUN gibt es nur Host-Kandidaten — das reicht im LAN und in CI,
nicht über NAT. STUN teilt einem Gerät nur seine eigene öffentliche Adresse
mit; es fließen weder Nutzdaten noch Signalisierung darüber. Es bleibt ein
Aufruf bei einem Dritten, der die IP des Geräts sieht: deshalb konfigurierbar
über `VITE_STUN_SERVERS` und per `?ice=host` vollständig abschaltbar. Default
sind zwei Anbieter (Google, Cloudflare) — für ein Studio, das das nicht will,
ist ein eigener STUN-Server ein Einzeiler in der Env.

**Kein TURN.** Symmetrische NATs auf beiden Seiten können ohne TURN nicht
verbinden. Der Remote-Pfad (Copy & Paste über Messenger) schlägt dort fehl;
der Studio-Pfad (QR, gleiches Netz) ist davon nicht betroffen. Der
Verbindungs-Assistent muss diesen Fall ehrlich benennen statt endlos zu drehen.

**Ein Relay, wenn jemand danach fragt.** Genau der oben beschriebene Fall —
symmetrisches NAT auf beiden Seiten, Remote-Pfad über Messenger — ist der
Grund, aus dem der Knoten seit `feat/relay-optional-transports` einen Relay
_kann_. Er benutzt keinen: `circuitRelayTransport` und `webSockets` sind
Fähigkeit, nicht Verwendung. Ohne `relayOptIn` gibt es keine Bootstrap-Liste,
kein angekündigtes `/p2p-circuit` und ein `denyDialMultiaddr`, das jede
Adresse ablehnt, die keine QR-Sitzung ist — prüfbar in
`src/lib/p2p/libp2p-config.spec.js`, wo die Relay-Adresse absichtlich
übergeben und trotzdem nicht gewählt wird.

Was ein zugeschalteter Relay kostet, gehört hierher und nicht in die
Bedienoberfläche: Der Relay sieht, dass zwei Peers zueinander wollen, und
er sieht ihre IP-Adressen. Die Nutzdaten laufen danach direkt zwischen den
Geräten, aber die Verbindungs-Metadaten liegen bei ihm. Deshalb ist die Wahl
ausdrücklich und nicht voreingestellt, und deshalb werden eingebackene
Adressen vor einer Verzeichnisabfrage geprüft: Wer die App im Studio benutzt,
soll nicht einmal ein Verzeichnis kontaktieren.

### 1.3 Privacy: OrbitDB repliziert ganze Datenbanken — und kennt keine Leserechte

Zwei getrennte Punkte, die oft vermischt werden:

**Voll-Replikation.** Es gibt keine Teil-Replikation. Wer eine
`bookings-<location>`-DB repliziert, hat damit auch die Buchungen aller
anderen darin: DID, Anzeigename, Kurs, Termin, Status.

**Keine Lese-ACL.** Der Access Controller regelt ausschließlich `canAppend`.
Wer eine Datenbankadresse kennt und einen Peer erreicht, der sie hält, kann
sie vollständig lesen. „Schüler replizieren nur den eigenen Ticket-Ledger" ist
deshalb eine Verteilungs-Konvention, keine durchgesetzte Grenze.

Vollständige Aufstellung der betroffenen Daten und Metadaten, was
Verschlüsselung daran ändert und was nicht:
[`docs/PRIVACY.md`](./PRIVACY.md). Die dortige Empfehlung ist ein anderer
Zuschnitt (Buchungs-DB pro Schüler), nicht Verschlüsselung — bei Multi-Writer
handelt man sich sonst ein Schlüsselverteilungs- und Rotationsproblem ein.

### 1.4 Feld-Level-Rechte fehlen in OrbitDB-ACLs

Die Statusregel „Studio-Geräte setzen `confirmed|declined`, Schüler nur
`requested|cancelled`" ist **App-Logik über der DB-ACL**, nicht von der DB
erzwungen. Ein manipulierter Client mit Write-Grant kann jeden Status
schreiben. Erkennbar bleibt es über `entry.identity` — die Rolle des Schreibers
steht in der Registry.

### 1.5 Widerrufs-Latenz

Ein widerrufenes Gerät kann bis zur nächsten Verbindung weiter gültig
signieren. Der Reducer wertet Events **ab Kenntnis des Widerrufs** aus:
alles mit Zeitstempel nach `revokedAt` wird abgelehnt, alles davor bleibt
gültig. Rückwirkende Ungültigkeit würde einen Tag legitim verkaufter Tickets
vernichten.

### 1.6 QR-Payload-Größe

Ein signiertes, deflate-komprimiertes Offer liegt nahe an dem, was ein Telefon
von einem Bildschirm noch zuverlässig liest. Das ist kein Wall mehr: `<qr-invite>`
entscheidet selbst und zerlegt einen zu dichten Payload in eine animierte
BC-UR-Sequenz — fountain-codiert, Frames sind in beliebiger Reihenfolge lesbar,
ein verpasster kostet nichts. `QR_CHARACTER_BUDGET` (2200 Zeichen) ist damit
kein Schalter mehr, sondern nur noch die Grenze, unterhalb derer ein _einzelner_
statischer Code reicht; der Invite-Test hält die Link-Länge darunter, damit der
häufige Fall ohne Animation auskommt.

Was bleibt: eine Sequenz braucht eine ruhige Hand und ein paar Sekunden mehr,
und sie will einen Bildschirm, der nicht in Standby geht.

## 2. Upstream-Fragen

### 2.1 `@le-space/libp2p-webrtc-qr`

- **Kleinerer Payload** (QWBP-Richtung) würde die animierten Sequenzen aus 1.6
  seltener nötig machen — mit einer Einschränkung, die dabei nicht verloren
  gehen darf: `canonicalPayload` signiert `sdp` als Ganzes, weshalb der
  DTLS-Fingerprint per Konstruktion in den signierten Bytes liegt. Genau das
  trägt `skipEncryption`. Ein kompakteres Format, das das SDP rekonstruiert
  statt es zu übertragen, müsste den Fingerprint explizit mitsignieren
  ([`docs/connection-security.md`](https://github.com/NiKrause/libp2p-webrtc-qr/blob/main/docs/connection-security.md)).
- **Vendored `@libp2p/webrtc`-Internals**: das Paket kopiert Interna, die
  upstream nicht exportiert sind. Ein `exports`-Eintrag bei `@libp2p/webrtc`
  würde die Kopie überflüssig machen.
- **Firefox/WebKit** sind nicht getestet. Chromium ist deshalb das PR-Gate,
  die anderen laufen nightly und non-blocking.

### 2.2 `@le-space/orbitdb-identity-provider-webauthn-did`

#### Das Identitätsdokument ist über Reloads nicht stabil — blockiert T2.2

**Der schwerwiegendste offene Punkt.** Die DID bleibt über Seitenladevorgänge
konstant (sie stammt aus dem Passkey), das **Identitätsdokument** dazu aber
nicht: Gemessen am 2026-07-29 ergaben drei Reloads **drei verschiedene
Identitäts-Hashes bei einer stabilen DID**.

Warum das die Replikation zerstört: Jeder OrbitDB-Eintrag verweist über
`entry.identity` auf den **Hash** des Dokuments, das ihn signiert hat. Ein
prüfendes Gerät muss genau dieses Dokument auflösen; gelingt das nicht, gibt
`canAppend` false zurück, und OrbitDB **verwirft den Eintrag endgültig** — ohne
Retry und ohne Fehler, den jemand mitbekäme. Sichtbar wird nur:
`Could not append entry: Key "<hash>" is not allowed to write to the log`.

Beobachtetes Verhalten in `e2e/m2-studio-join.spec.js`: Alices **Registry
repliziert** zu Bob (2 Einträge), ihr **Programm nicht** (0 Einträge). Der
Unterschied ist allein, welche Sitzung den jeweiligen Eintrag signiert hat.
Mesh, Subscriptions, Sync-Peers und Zugriffsrechte sind auf beiden Seiten
nachweislich korrekt — geprüft über `window.__yoga` (siehe
`src/lib/p2p/node.js`).

Ausgeschlossen wurde:

- **Gossipsub** — 16.1.0 auf beiden Seiten, Mesh gegraftet, Topics abonniert.
- **Ein persistenter Keystore** (`KeyStore` + `LevelStorage`) — eingebaut, weil
  ein Keystore, der bei jedem Laden neue Schlüssel erzeugt, ohnehin falsch ist.
  Er behebt die Hash-Instabilität **nicht**.
- **Ein verzögerter Resync** (`sync.stop()`/`start()`, auch mit Pause) — holt
  verworfene Einträge nicht zurück.

Verdacht: die Warnung `Failed to extract real public key from WebAuthn
credential, using fallback: Error: Insufficient data`, die der Provider bei
jedem Start ausgibt. Der Fallback erzeugt offenbar bei jedem Lauf ein anderes
Schlüsselmaterial.

**Isoliert reproduziert** in `repro/webauthn-identity-stability/` — ohne diese
App, ohne libp2p, ohne Replikation. Der Repro zeigt auch das genaue Feld:

| Feld                   | über 3 Reloads     |
| ---------------------- | ------------------ |
| `id` (DID)             | stabil             |
| `publicKey`            | **stabil**         |
| `signatures.id`        | stabil             |
| `signatures.publicKey` | **3 verschiedene** |

`signatures.publicKey` ist eine **live erzeugte WebAuthn-Assertion**. Die
enthält per Konstruktion bei jedem Aufruf eine frische Challenge und einen
inkrementierten Zähler, und ECDSA signiert randomisiert. Ein Dokument, das eine
Assertion einbettet, kann niemals stabil content-adressiert sein — das ist ein
Entwurfskonflikt, kein Flüchtigkeitsfehler: Content-Adressierung braucht
Determinismus, WebAuthn-Assertions sind absichtlich nicht deterministisch.

`createIdentity` in `@orbitdb/core` signiert zudem bei **jedem** Aufruf neu und
kennt keinen Cache-Lookup — ein persistenter Storage-Parameter hilft deshalb
nicht.

**Lokale Abhilfe, umgesetzt:** `stableIdentity()` in `src/lib/p2p/node.js` merkt
sich den Hash des zuerst erzeugten Dokuments und verwendet es danach wieder. Da
nur die Signatur variiert, bleibt das erste Dokument dauerhaft gültig. Weil
`getIdentity()` es ohne `sign`-Funktion zurückgibt, wird der Signierer der
frisch erzeugten Identität geliehen — derselbe private Schlüssel, wie der
stabile Public Key belegt. Abgesichert durch `e2e/m2-identity.spec.js`.

**Vorschlag nach upstream:** die Assertion nicht einbetten (Schlüssel per PRF
ableiten und deterministisch signieren), oder in `createIdentity` vor dem
Signieren nach einer vorhandenen Identität für die id suchen.

**Stand T2.2: erledigt.** Mit stabilem Identitätsdokument repliziert die
Programm-DB wie die Registry — Bob sieht einen Kurs, den Alice während der
bestehenden Verbindung anlegt (`e2e/m2-studio-join.spec.js`, grün). Damit ist
belegt, dass die Instabilität die einzige Ursache war: Mesh, Subscriptions,
Sync-Peers und ACL waren die ganze Zeit korrekt.

**Behoben upstream in 0.4.0** (gemeldet als
[#18](https://github.com/Le-Space/orbitdb-identity-provider-webauthn-did/issues/18)).
`signIdentity()` verwendet jetzt den bereits erzeugten Proof wieder, statt eine
frische WebAuthn-Assertion zu laufen. Der dortige Changelog nennt zusätzlich die
Ursache, die wir von außen nicht sehen konnten: `verifiedIdentitiesCache` in
`@orbitdb/core` ist auf das **deterministische** `signatures.id` gekeyt, zwei
Dokumente aus einem Keystore kollidieren also auf einem Cache-Eintrag, und
`isEqual()` verwirft das später verifizierte. Genau daher das Bild „manche
Einträge replizieren, der Rest lautlos nie".

`stableIdentity()` ist **entfernt**. `e2e/m2-identity.spec.js` bleibt und prüft
die Eigenschaft, nicht den Workaround; der isolierte Repro in
`repro/webauthn-identity-stability/` läuft unter 0.4.0 mit einem Hash über drei
Loads durch (vorher drei).

**Zwei Dinge, die daran hängen:**

- **Die DID ändert sich** gegenüber 0.3.x — `extractPublicKey()` hatte
  `byteOffset` ignoriert und still einen synthetischen Schlüssel aus
  `SHA-256(credentialId)` abgeleitet. Wer unter 0.3.x registriert war, bekommt
  eine neue DID; Registry-Einträge, Grants und die daraus abgeleiteten
  Ledger-Adressen (§1.7) gelten dann nicht mehr. Im aktuellen Stand ohne
  Produktivdaten ist das folgenlos, vor einem echten Rollout braucht es einen
  Migrationspfad.
- **Bezogen per Git-Tag**, nicht über npm: 0.4.0 ist noch nicht veröffentlicht,
  `package.json` zeigt auf
  `github:Le-Space/orbitdb-identity-provider-webauthn-did#v0.4.0`. Das Paket
  liefert reines ESM ohne Build-Schritt, funktioniert also direkt. Sobald es auf
  npm liegt, wird daraus wieder eine Versionsangabe — kein Vendoring, keine
  Kopie.

#### Weitere Punkte

- **Typen zu streng**: `createCredential`, `writeLargeBlobMetadata`,
  `readLargeBlobMetadata` und die Provider-Factory deklarieren jede Option als
  Pflichtfeld, obwohl die Implementierung sie defaultet; Rückgaben sind
  `Object` statt der tatsächlichen Form. Aufrufstellen casten deshalb an der
  Grenze (`src/lib/identity/passkey-identity.js`, `src/lib/p2p/node.js`).
- **Create-or-Recover-Flow ist nur Demo-Code** im `examples/`-Verzeichnis.
  `src/lib/identity/passkey-identity.js` ist eine Kopie davon; sobald der
  Flow upstream als Helfer exportiert ist, ersetzt der Import diese Datei.
- **E2E-Helper nicht exportiert**: Der CDP-Virtual-Authenticator-Helfer aus den
  dortigen E2E-Tests musste nach `e2e/webauthn.js` kopiert werden.

### 2.3 `@orbitdb/core`

- `createOrbitDB` akzeptiert `identities` zur Laufzeit, die Typdeklaration
  kennt den Parameter nicht.
- Feld-Level-Rechte in Access-Controllern (siehe 1.4).
- Einträge, die vor der Schreibmenge eintreffen, werden abgewiesen und nie
  erneut angeboten (siehe 1.8) — der teuerste Befund des Projekts bisher, weil er
  wie „nichts gekauft" aussieht.
- `database.js` schreibt die Ablehnung eines Eintrags in ein `console.error`
  (Zeile 157) statt in ein `error`-Event. Genau der Fall, den eine Anwendung
  bemerken müsste, ist damit der einzige, den sie nicht abfangen kann.

### 2.5 CDP Virtual Authenticator: largeBlob ist nicht prüfbar

Der Recovery-Pfad „neues Gerät, gleicher Passkey" legt die Identitätsdaten in den
**largeBlob** des Credentials — dorthin, wo sie ein Plattform-Keychain mitsynct.
Unter dem CDP Virtual Authenticator lässt sich das **nicht** testen, und zwar aus
zwei getrennt gemessenen Gründen:

- Ein Schreibvorgang meldet Erfolg (keine Warnung, keine Exception), der
  anschließende Lesevorgang liefert **keinen Blob** — auch im selben Authenticator.
- `WebAuthn.getCredentials` gibt überhaupt kein `largeBlob`-Feld heraus. Zurück
  kommen `credentialId`, `privateKey`, `userHandle`, `signCount` und Namensfelder.
  Der Blob lässt sich also auch nicht in einen zweiten virtuellen Authenticator
  übertragen.

Folge für die Tests: `e2e/m5-recovery.spec.js` prüft den Wiederanlauf mit
erhaltenem Passkey-Eintrag und die Rückkehr der Karten allein durch Kopplung. Der
largeBlob-Rundlauf ist **auf echter Hardware zu prüfen** und steht in
`docs/TESTING.md` auf der Geräte-Checkliste.

Folge für die App: `recoverPasskeyCredential` sagt jetzt auch dann etwas, wenn der
Blob schlicht **leer** ist, nicht nur wenn das Lesen wirft. Beides sieht auf dem
Schirm gleich aus („Kein Passkey auf diesem Gerät"), ist aber ein völlig anderes
Problem — und die stille Variante ist die gefährlichere.

### 2.4 Le-Space Brand-Repo

Mehrere Brand-Werte verfehlen WCAG AA für Fließtext auf den Gründen, für die
sie gedacht sind — Cyan-Light 3,55:1, Coral-Light 3,28:1, Comet Grey auf Nebula
3,49:1 (Messwerte und Ersatzwerte in `docs/DESIGN.md`). Der Guide nennt
„Coral auf Deep Space 6,6:1 — AA-konform", was für Deep Space stimmt, für
Nebula und für Weiß aber nicht.

Vorschlag nach upstream: eine dokumentierte **Text-Variante** je Akzentfarbe,
zusätzlich zur Marken-Variante. Die hier abgeleiteten Werte sind der Entwurf
dafür.

Außerdem fehlen die Schriftdateien (Inter, JetBrains Mono) im Brand-Verzeichnis
— die App rendert bis dahin in System-Fallbacks.

### 1.7 Wer das Ledger besitzt — entschieden: das Studio

Bis T4.3 legte das **Schülergerät** seine Ledger-DB selbst an und erteilte den
Studio-Geräten Schreibrecht. Zwei Probleme, eines davon operativ:

- Der Grant musste zum Studio replizieren, **bevor** dessen Schreibvorgänge
  angenommen wurden. Eine Kasse, die Sekunden nach dem Koppeln verkauft, war
  einfach zu früh dran und bekam `Could not append entry` (Behelf: 15 s
  Wiederholen statt Fehlermeldung).
- Admin des Ledgers war der **Schüler**. Ausnutzbar war das nicht — ohne
  schreibbare Entwertung lässt die Theke niemanden ein —, aber es lag die Macht,
  weitere Abbuchungen zu verhindern, bei genau der Person mit dem Interesse
  daran. Der Anspruch richtet sich gegen das Studio, also sollte das Studio das
  Buch führen.

**Umgesetzt: das Studio besitzt jedes Ledger** (`src/lib/db/studio-acl.js`). Es
brauchte kein neues Protokoll, nur eine feste Schreibliste — der Schlüssel liegt
darin, dass ein OrbitDB-Manifest genau `{ name, type, accessController }` ist und
den Ersteller **nicht** enthält:

- Alle Ledger eines Studios teilen einen Access-Controller
  (`yoga-acl-<ownerDid>`), dessen `IPFSAccessController`-Schreibliste auf den
  Owner festgelegt ist. Ein IPFS-Controller ist unveränderlich und
  content-adressiert.
- Damit landet jedes Gerät, das `yoga-tickets-<studentDid>` über den **Namen**
  öffnet, auf derselben Adresse — Owner, Theke am zweiten Standort, Schüler.
  `ticketsAddress` ist aus dem `device-hello` **entfernt**: Niemand bekommt die
  Adresse gesagt, alle leiten sie ab. Zwei Theken, die sich nie begegnet sind,
  können also nicht zwei Ledger für dieselbe Person anlegen.
- `capabilities().admin` ist die Vereinigung der Admin-Einträge mit der
  Schreibliste des darunterliegenden IPFS-Controllers
  (`access-controllers/orbitdb.js`). Der Owner ist deshalb Admin **jedes**
  Ledgers, der Schüler ist weder Admin noch Writer.
- Ein vom Owner signierter Eintrag ist **ohne jede Replikation** gültig: dessen
  DID steht im unveränderlichen Manifest, nicht in einem Log, das erst ankommen
  muss. Für alles, was der Owner schreibt, ist das Rennen aus §1.8 damit weg.
- Ein Theken-Gerät braucht **einen** Grant, nicht einen pro Schüler: der
  gemeinsame Controller deckt alle bestehenden und künftigen Ledger ab. Erteilt
  wird er bei der Gerätefreigabe (`registerDevice`), zurückgezogen beim Widerruf.

Belegt in `e2e/m4-tickets.spec.js` („the studio owns the ledger and the student
cannot write to it"): Beide Seiten kommen auf dieselbe Adresse, ohne dass eine
ausgetauscht wurde, und Alices DID steht in `admin`, Bobs in keiner der beiden
Mengen. Der Kurier-Rundlauf lief danach 32,6 s statt 42,8 s — der Grant reist
nicht mehr.

**Was bleibt.** Ein Theken-Gerät muss seinen einen Grant in die eigene Kopie des
Controllers replizieren, bevor es anhängen darf; das begrenzte Wiederholen in
`putWhenPermitted` bleibt deshalb als Absicherung. Und das Buchungsmodell ist
davon unberührt: Buchungs-DBs gehören weiter dem Schüler, weil dort der Schüler
der legitime Schreiber ist.

### 1.9 Ein negativer Saldo ist über die Oberfläche nicht erreichbar

`unitsRemaining` ist im Reducer bewusst **nicht** geklammert, und
`findOverdrafts` (`src/lib/db/reconcile.js`) rechnet einen negativen Saldo in
Euro um. Beim Bauen des E2E dazu stellte sich heraus: Über die Schirme dieser App
lässt sich ein negativer Saldo gar nicht erzeugen — und das ist eine Eigenschaft
des Entwurfs, kein fehlendes Feature.

- Der Check-in weist ab, wenn nichts mehr übrig ist (`no-units-left`).
- Zwei Theken, die um dieselbe Kettenposition rennen, erzeugen einen **Fork**, und
  ein Fork kostet genau **eine** Einheit, nie zwei. Aus zwei Entwertungen auf einer
  Einer-Karte wird also Saldo 0, nicht −1 (belegt in `e2e/m5-report.spec.js`).

`findOverdrafts` bleibt trotzdem, denn es deckt genau den Fall aus §1.1 ab, der
sich nur **erkennen** und nie verhindern lässt: ein Ledger, das nicht von diesen
Schirmen geschrieben wurde — ein Import oder ein manipulierter Client, der die
Vorprüfung überspringt. Seine Arithmetik ist in `src/lib/db/reconcile.spec.ts`
bewiesen, wo sich so ein Ledger einfach hineinreichen lässt.

Aus derselben Messung entstand die Spalte **Strittig** im Kassenbericht: Bei einem
Fork ist _keine_ der beiden Entwertungen angenommen, es wurden aber zwei Stunden
gehalten. „0 Check-ins" wäre wahr und nutzlos gewesen.

### 1.8 Einträge kommen an, werden abgewiesen und nie erneut angeboten

Ein Studio-Gerät, das das Ledger eines Schülers **zum ersten Mal** öffnet,
bekommt dessen bestehende Historie oft nicht — und zwar völlig geräuschlos.
Gemessen an der Kurier-Szene (Carol öffnet Bobs Ledger, in dem ein Verkauf und
eine Entwertung stehen):

| Beobachtung                               | Wert                                   |
| ----------------------------------------- | -------------------------------------- |
| Topic subscribed, Gossipsub-Mesh          | beidseitig vollständig                 |
| `db.sync.peers`                           | beide Seiten führen einander           |
| `error`-Events auf allen drei Geräten     | keine                                  |
| Carols Log nach 20 s                      | **0 Einträge, 0 Heads**                |
| Carols Browser-Konsole                    | **genau 2 × `Could not append entry`** |
| abgewiesener Key                          | Alices Identity-Hash                   |
| `resolveIdentity(hash)` auf Carol         | löst auf — DID + `webauthn`            |
| nach einem `sync.stop()` / `sync.start()` | 2 Einträge, 1 Head, in unter 5 s       |

**Ursache.** Die Einträge kommen an und werden dann _abgelehnt_. Ein
`OrbitDBAccessController` ist selbst eine OrbitDB-Datenbank: Wer ein Log erstmals
öffnet, muss die **Schreibmenge** replizieren, bevor er irgendetwas darin
validieren kann. Beides läuft gleichzeitig über dieselbe Verbindung, und wenn die
Einträge dieses Rennen gewinnen, prüft `canAppend` sie gegen eine Schreibmenge,
die noch nicht da ist:

```
Could not append entry:
Key "zdpuAndNWkQ93hV9Ndhp6CNQPoibdfRJWScz3jm4rfuWd7fs9" is not allowed to write to the log
```

`database.js` macht daraus in Zeile 157 ein nacktes `console.error` statt eines
`error`-Events — deshalb sieht keine Diagnose es. Die Schreibmenge kommt Sekunden
später an, die abgewiesenen Einträge werden aber **nie erneut angeboten**.

Damit ist das dieselbe Fehlerklasse wie das Grant-Rennen in §1.7, nur von der
Leseseite aus: korrekte Daten, zu früh eingetroffen, endgültig verworfen.

**Zwei Erklärungen, die wir gemessen und verworfen haben** — beide sahen
plausibel aus, und der Unterschied ließ sich nur an Zahlen entscheiden:

1. _Der leere Partner schließt den gemeinsamen Stream._ In `sync.js` lesen und
   schreiben beide Enden denselben bidirektionalen Stream, und jedes ruft
   `stream.close()`, sobald sein eigenes Senden fertig ist (Zeilen 175 und 202) —
   wer nichts zu senden hat, ist sofort fertig. Widerlegt: Beide Seiten führten
   einander in `peers` (Upstream löscht bei jedem Fehler wieder), und die
   Konsolenmeldungen beweisen, dass die Einträge sehr wohl ankamen.
2. _Die Identity ist nicht auflösbar._ Widerlegt: `resolveIdentity` liefert auf
   Carol Alices DID und Typ `webauthn`.

**Warum es lange unentdeckt blieb.** Bei zwei Geräten ist die schreibende Seite
Admin ihres eigenen Logs und die lesende hat den Grant selbst erteilt — niemand
prüft gegen eine _replizierte_ Schreibmenge. Das passiert zuerst beim dritten
Gerät am zweiten Standort, also genau in der Szene, für die dieses Projekt
existiert.

**Ein zweiter Fall, gefunden beim Fork-Alarm (T4.4): ein Gerät leitet nichts
weiter, was es selbst nicht geschrieben hat.** Bob hielt beide widersprüchlichen
Entwertungen, Alice war mit Bob durchgehend verbunden — und bekam die von Carol
nie. Zwei Upstream-Verhaltensweisen wirken hier zusammen gegen das Kuriermodell,
auf dem diese App aufbaut:

- `sync.add()` publiziert nur **selbst angehängte** Einträge
  ([#1255](https://github.com/orbitdb/orbitdb/issues/1255), Punkt 1). Ein
  Schüler, der eine fremd geschriebene Entwertung trägt, gibt sie nicht weiter.
- Der Heads-Austausch findet **einmal pro Peer** statt. Eine neue Verbindung zu
  einem Peer, der nie aus `sync.peers` fiel, wiederholt ihn nicht (Punkt 2).

Zusammen heißt das: Eine Theke kann mit genau dem Kurier verbunden sein, der den
fehlenden Eintrag trägt, und ihn nie erhalten. `pullHistory` deckt das **nicht**
ab — es rettet bewusst nur ein leeres Log, hier hängt das Log lediglich hinterher.
Deshalb fragt `askPeersForHistory` bei **jeder neuen Verbindung** einmal alle
offenen Datenbanken erneut nach Heads (`src/lib/p2p/node.js`, 1,5 s nach
`connection:open`, damit die Subscriptions ausgetauscht sind). Begrenzt und
idempotent: eine Runde pro Auslöser, überlappende Auslöser fallen zusammen.

**An der Ursache behandelt, seit Task #17.** `deferCanAppend`
(`src/lib/db/defer-can-append.js`) umhüllt das `canAppend` des
Studio-Controllers: Auf eine Ablehnung wartet es **einmal** kurz darauf, dass das
Access-Control-Log ein Lebenszeichen gibt, und fragt dann dieselbe Frage erneut.
Idee und Schutzmaßnahmen stammen aus
`Le-Space/orbitdb-relay-pinner` (`src/access/deferred-orbitdb-access-controller.ts`).

Drei Schranken, jede mit Grund: allein im Netz gibt es nichts zu erwarten; sobald
das Log einmal gesprochen hat, ist eine Ablehnung eine echte Ablehnung; und die
Wartezeit ist begrenzt, damit ein stummer Peer nicht den Check-in-Schirm blockiert.
Ohne diese Schranken würde jeder gefälschte Eintrag — ein Schüler, der in sein
eigenes Ledger schreibt — die Theke fünf Sekunden anhalten.

Die Entscheidungslogik liegt in einem eigenen Modul und ist ohne OrbitDB
unit-getestet (`defer-can-append.spec.ts`). Der Test fand dabei einen Fehler im
ersten Entwurf: Trifft das erwartete Ereignis genau zwischen der ersten Prüfung und
dem Aufspannen der Wartezeit ein, hätte die Antwort genau in dem Moment verworfen
werden können, in dem sie ankam. „Bereits gesehen" heißt jetzt _nicht warten_, nicht
_ablehnen_.

**Umsetzung davor, weiterhin als Absicherung.** `pullHistory` in `src/lib/db/open.js` fragt nach dem Öffnen
erneut nach, solange das Log leer ist und Sync-Peers vorhanden sind — begrenzt
auf fünf Versuche im Abstand von 2 s, ausschließlich über die öffentliche API.
Bewusst konservativ: Es rettet nur die totale Stille und füllt nie ein Log auf,
das lediglich hinterherhängt. Ein wirklich leeres Ledger — ein Schüler, der noch
nichts gekauft hat — ist der Normalfall und darf an der Theke nicht zu einer
Endlosschleife werden.

Wenn das Studio die Ledger anlegt (§1.7), verschwindet die Ursache für Ledger:
Das Studio ist dann von Anfang an Admin, und die Schreibmenge muss nicht mehr
reisen. Für Registry und Programm bleibt der Fall bestehen, dort ist `pullHistory`
weiterhin die Absicherung.

**Wir haben das schon einmal gelöst, an einer besseren Stelle.**
`Le-Space/orbitdb-relay-pinner` enthält in
`src/access/deferred-orbitdb-access-controller.ts` einen eigenen
Access-Controller, dessen `canAppend` bei fehlendem Schreibrecht **wartet**
(`waitForAclReplication`, 5 s, sofortige Rückkehr wenn es keine Peers gibt) und
dann erneut prüft, statt den Eintrag zu verwerfen. Das behandelt die Ursache am
Ort des Ausfalls; `pullHistory` behandelt nur die Folge. Der in simple-todo
verwendete `@le-space/orbitdb-access-controller-delegated-todo` hat diese Logik
**nicht** — er ergänzt Delegation, nicht Deferral.

Zu entscheiden: dieselbe Deferral-Logik hier übernehmen und `pullHistory` auf
Registry und Programm beschränken oder ganz entfernen. Kein Vendoring — ein
eigener Access-Controller ist der dafür vorgesehene Erweiterungspunkt.

Nach upstream noch nicht gemeldet — verwandt mit
[orbitdb/orbitdb#1255](https://github.com/orbitdb/orbitdb/issues/1255), siehe
Issue #13 in diesem Repo.

### 1.10 Der Produktname ist umbenannt, die Bezeichner sind es nicht

Sichtbar heißt die App **Yogasūcī (योगसूची)**, technisch `yogasuci`; seit dem
2026-08-01 heißen auch die Domain und das GitHub-Repository so. Eine Reihe von
Bezeichnern trägt aber weiterhin `yoga-p2p` bzw. `yoga-`, und das ist **Absicht**,
kein vergessenes Vorkommen:

| Bezeichner                                                                      | Warum er bleibt                                                                                                                  |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `yoga-tickets-<did>`, `yoga-acl-<did>`, `yoga-registry`, `yoga-bookings-<did>`  | **Datenbanknamen.** Die Adresse eines Ledgers wird aus dem Namen abgeleitet (§1.7) — ein anderer Name ist eine andere Datenbank. |
| `yoga-p2p/blocks`, `yoga-p2p/data`                                              | IndexedDB-Stores. Umbenennen heißt: jedes Gerät startet leer.                                                                    |
| `yoga-p2p.databases`, `.passkeyCredential`, `.iceMode`, `.installHintDismissed` | localStorage-Schlüssel. Umbenennen heißt: gemerkte Adressen weg, Identität scheinbar verloren.                                   |
| `yoga-p2p/export/1`                                                             | Format-Kennung im Export. Ältere Sicherungen müssen lesbar bleiben.                                                              |
| `ALEPH_SITE_NAME: yoga-p2p` in `deploy.yml`                                     | Benennt die Site im Aleph-Aggregat. Ein anderer Name ist eine **neue** Site — die bestehende bliebe verwaist zurück.             |
| `window.__yoga`                                                                 | Diagnose-Oberfläche, an der die gesamte E2E-Suite hängt.                                                                         |

Ein Umbenennen dieser Namen ist **keine Umbenennung, sondern eine Datenmigration**:
alte Namen weiter öffnen, Inhalte übertragen, Adressen neu bekanntgeben. Für ein
Projekt ohne Produktivdaten wäre das machbar; sobald ein Studio damit arbeitet,
kostet es dessen Kassenbelege. Deshalb ist der Zeitpunkt dafür **jetzt oder nie** —
und „nie" ist eine vertretbare Wahl, weil diese Namen niemand außer Entwicklern
je sieht.

## 3. Gemessen und nicht gemessen

Die Benchmark-Suite steht (`bench/`, `pnpm run bench`, Bericht in
`bench/report.md`). Deterministischer Seed, damit zwei Läufe desselben Commits
dieselben Zahlen liefern und eine Änderung daran eine echte ist.

**Gemessen** (S1–S6, 100–1000 Schüler, 1–4 Jahre): Fold eines Schüler-Ledgers,
Reconciliation über alle Ledger, Storage-Untergrenze. Alle Budgets deutlich
eingehalten — S6 (1000 Schüler, 2 Jahre, 132 000 Events) rechnet in gut 5 s
gegen ein skaliertes Budget von 600 s.

**Und genau das ist der uninteressanteste Teil des Ergebnisses.** Der Reducer ist
nicht der Engpass — was §6.4 vorhergesagt hat, zusammen mit der Stelle, wo der
Engpass stattdessen sitzt: die **Anzahl** der Datenbanken, zwei pro Schüler. Das
lässt sich aus Node heraus nicht messen.

**Nicht gemessen**, und ohne Browser-Harness auch nicht messbar: Cold Start
(< 5 s), Erst-Pairing (< 15 s), inkrementeller Check-in-Sync (< 3 s). Ein
Node-Ersatzwert dafür würde wie Abdeckung aussehen; die Suite weist sie deshalb
ausdrücklich als „nicht gemessen" aus, statt sie wegzulassen. Ebenfalls offen:
der Remote-Lauf über echte Netze (Harness aus relay-button bzw. `simple-todo`).

Die Signaturprüfung ist in den Benchmarks auf `true` gestubbt — sie ist eine
WebAuthn-Operation. Die Fold-Zahlen sind also die Kosten des Reducers, nicht die
eines Check-ins.

Umgesetzt ist die Gegenmaßnahme, die §6.4 als **Voraussetzung** nennt: ein
begrenzter LRU für offene Schüler-Ledger (`src/lib/db/lru.js`, 60 gleichzeitig).
Er schließt immer das am längsten ungenutzte — der Mensch an der Theke ist per
Definition das zuletzt benutzte und kann nie verdrängt werden. Sein Effekt auf
Cold Start und RAM gehört zu den oben genannten, noch nicht messbaren Zahlen.

Budget-Verletzungen werden hier protokolliert und lösen eine Design-Aktion aus —
niemals eine Anhebung des Budgets.
