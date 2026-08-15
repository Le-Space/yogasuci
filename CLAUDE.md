# CLAUDE.md — yogasuci

## Sprache

**Issues und Commit-Nachrichten auf Englisch.** Sie richten sich an alle, die das
Repository lesen, auch an Upstream-Projekte, in die etwas gemeldet wird.

**Das Handbuch (`docs-site/`) immer zweisprachig**, Deutsch und Englisch
gleichwertig. Eine Seite, die nur in einer Sprache existiert, ist nicht fertig —
sie ist eine halbe Seite für die Hälfte der Leser.

Die technischen Dokumente in `docs/` sind deutsch mit Übersetzungen in `docs/en/`;
welche übersetzt sind und welche nicht, steht in `docs/en/README.md`.

## Projekt

P2P-PWA für Yogastudio-Buchungen. Kein Relay, kein Server, kein
Backend: Signalisierung nur über `@le-space/libp2p-webrtc-qr` (QR) und
Copy-&-Paste-SDP. Architektur und Tasks: `docs/PLAN.md` (verbindlich).

## Benennung

**Diese App ist eine P2P-PWA, nicht „local-first".** Das ist keine Geschmacksfrage:
Local-first beschreibt Software, deren Daten lokal liegen und die _zusätzlich_ mit
einem Server abgleicht — der Abgleich ist dort die Zutat, die man weglassen könnte.
Hier ist die Peer-Verbindung die **einzige** Übertragung, die es überhaupt gibt. Es
existiert kein Server, zu dem später synchronisiert würde, und keiner, den ein
Studio irgendwann doch mieten müsste. „Local-first" verspricht an dieser Stelle
weniger, als die App tut, und lenkt zugleich von dem ab, was sie ausmacht.

Auch nicht „local-first Peer-to-Peer" — das stand an zwei Stellen und war doppelt
gemoppelt.

Produktname überall sichtbar **Yogasūcī (योगसूची)**, technisch `yogasuci`. Welche
Bezeichner bewusst weiterhin `yoga-p2p` heißen und warum, steht in
`docs/LIMITS.md` §1.10.

## Harte Regeln

- Toolchain: pnpm, Node ≥ 22, SvelteKit (adapter-static), Playwright, Tailwind 4,
  Paraglide.
- NIEMALS Relay-, Signaling-, WebSocket- oder TURN-Abhängigkeiten einführen.
  Einziger Transport: `@le-space/libp2p-webrtc-qr`.
  Zwei begründete Ausnahmen, beide in `docs/LIMITS.md` belegt: **gossipsub** als
  libp2p-Service (OrbitDB repliziert nicht ohne pubsub; läuft ausschließlich
  innerhalb der direkten WebRTC-Verbindung) und **STUN** zur ICE-Kandidaten-
  Ermittlung (konfigurierbar, per `?ice=host` abschaltbar). Beides sind keine
  Server, über die Daten oder Signalisierung laufen.
- Normaler Git-Workflow: Feature-Branch pro Task, PR mit grünen Tests in `main`;
  `main` ist immer lauffähig. Kein Direkt-Push auf `main`.
- Upstream-Lücken (webrtc-qr, OrbitDB, libp2p, WebAuthn-Provider) NICHT lokal
  patchen oder vendoren: in `docs/LIMITS.md` dokumentieren und als
  Upstream-Issue formulieren. Typ-Lücken an der Grenze casten, nicht umbauen.
- Ledger-Logik (`src/lib/ledger/`) bleibt reines TypeScript ohne UI-, Browser-
  oder OrbitDB-Imports; jede Änderung dort braucht Unit-Tests inkl.
  Reihenfolge-Invarianz.
- Ticket-Events sind append-only. Niemals Guthaben als Feld speichern oder
  Events mutieren; Guthaben ist immer aus dem Log berechnet.
- Zwei Invarianten des Reducers, bei jeder Änderung prüfen:
  1. Reihenfolge-Invarianz — eine gemischte Eingabe ergibt dieselbe Ausgabe.
  2. Kein Guthaben aus Widerspruch — ein mehrdeutiger Log darf eine Einheit
     kosten, aber niemals eine verschenken. Das gilt auch für unvollständig
     replizierte Ketten (fehlende `seq` zählt als verbraucht).
- Jede UI-Zeichenkette über Paraglide (de+en), keine hartkodierten Strings.
- Brand-Quelle ist ausschließlich `Le-Space/landing → docs/le-space-brand`.
  Design-Tokens nur von dort; jede Übernahme in `docs/DESIGN.md` mit Quelle
  belegen. Keine Farben/Fonts erfinden. Abgeleitete Werte dort als
  "abgeleitet" markieren (Kandidat für Upstream ins Brand-Repo).
- Farben/Typo nur über Tokens aus `src/lib/styles/tokens.css` bzw. das
  Tailwind-Mapping; nie rohe Hex-Werte in Komponenten. Beide Themes pflegen.
- Commits: klein, ein Thema, imperativische Message; kein Commit bei roten Tests.

## Releases

- Die im Fuß angezeigte Version kommt aus dem **letzten Git-Tag**, nicht aus
  `package.json` (das Feld stand vom ersten Commit an auf `0.1.0` und log damit
  jeden Deploy an). `scripts/build-version.mjs` leitet sie ab: genau auf dem Tag
  `v0.2.0`, sieben Commits danach `v0.2.0+7`, ohne Tag gar nichts.
- **Kein automatischer Bump pro Merge.** Der Commit-Hash identifiziert den Build
  schon eindeutig; ein Zähler, der pro Merge tickt, ist ein langsamerer Hash. Ein
  Tag wird gesetzt, wenn es einem Studio etwas zu sagen gibt.
- Release schneiden: `git tag -a v0.2.0 -m "…"` auf `main`, dann pushen. Der
  nächste Deploy zeigt die Version in App **und** Handbuch — beide lesen denselben
  Tag, damit ein Studio die zwei vergleichen kann.
- Workflows, die deployen, brauchen `fetch-depth: 0`. Ein flacher Klon bringt
  keine Tags, und die Version verschwindet dann still.

## Tests

- `pnpm test` = Unit (vitest, Node) + E2E (Playwright, Chromium-Gate).
- WebAuthn: NIEMALS einen Test-/Bypass-Modus in den Identity-Provider bauen.
  In E2E den CDP Virtual Authenticator aus `e2e/webauthn.js` verwenden.
- Paste-Pfad (`connectViaPaste`, `?ice=host`) ist Default. Kamera-Pfad über
  Chromium-Fake-Video-Capture. Share-Flow mit gestubbtem `navigator.share`
  testen, inkl. Copy-&-Paste-Fallback.
- Fixtures: `alice` (Location A), `carol` (Location B), `bob` (Schüler/Kurier);
  isolierte Storage-Partitionen, je eigene Emulator-Passkey-Identität.
- Selektoren nur über `data-testid`, nie über i18n-Texte. Sprache im Test über
  `browser.newContext({ locale })` setzen, nie annehmen.
- Zeitlogik über `page.clock`, keine echten Waits.
- Jede neue Funktion braucht ein E2E-Szenario in der zugehörigen
  `m*`-Spec-Datei; PR ohne passendes Szenario wird nicht gemerged.
- a11y: `axe` in beiden Themes auf allen Hauptscreens, Teil des Gates. Ein
  Kontrastfehler wird durch einen abgeleiteten Token gelöst, nie durch
  Ausschluss der Regel.

## Sicherheits-Invarianten (bei jedem Change prüfen)

- Entwertung ist immer: Heads ziehen → Signaturen + Kette verifizieren →
  redeem schreiben → zurückreplizieren. Nie token- oder QR-Bild-basiert.
- `redeem`: monotone `seq` + `prevRedeemHash` + Gerätesignatur. Forks anzeigen,
  nie stillschweigend mergen.
- Registry-Widerrufe bei jeder Verbindung anwenden, bevor Events akzeptiert
  werden. Widerruf wirkt ab `revokedAt`, nicht rückwirkend.
- Signaturprüfung ist im Reducer ein Pflichtparameter (`isSignatureValid`).
  Es gibt bewusst keinen Default — ein ungeprüfter Fold muss an der Aufrufstelle
  sichtbar sein.
