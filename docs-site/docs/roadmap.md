---
title: Was noch kommt
sidebar_position: 40
---

# Was noch kommt

Diese Seite ist absichtlich vorsichtig formuliert. Was hier steht, ist geplant oder
angedacht — nicht versprochen. Was die App **heute** kann, steht in den Kapiteln
davor; was sie nicht kann, unter [Was die App nicht kann](/what-it-cannot-do).

## Einladungslinks statt Code-Schieberei — als Nächstes

**Der wichtigste offene Punkt.** Heute verbindet man zwei Geräte, indem jemand
einen Code trägt: QR scannen, oder Text kopieren, einfügen, Antwort zurücktragen.
Ein Feldtest hat gezeigt, woran das scheitert — welches Textfeld, welche Rolle,
welche von zwei Zeichenketten die richtige ist.

Der Nachfolger ist ein **Einladungslink**. Man erzeugt eine Einladung, teilt sie
über das normale Teilen-Menü, und das andere Gerät öffnet sie einfach. Die Seite
prüft die Einladung und erzeugt die Antwort von selbst. Kein Textfeld, keine Rolle,
keine Verwechslung.

Wichtig für die Privatsphäre, und der Grund, warum das überhaupt vertretbar ist:
Die Daten stehen im **Fragment** der Adresse — dem Teil hinter dem `#`. Den
schicken Browser grundsätzlich nicht an einen Server. Der Link sieht aus, als führe
er irgendwohin; der empfindliche Teil verlässt das Gerät trotzdem nicht.

Der QR-Code bleibt: Er enthält dann den Link. Er wird um knapp 30 Zeichen länger
und liegt weiterhin deutlich unter dem, was eine Kamera zuverlässig liest.

Mitgeliefert wird außerdem eine Korrektur, die im Studio spürbar ist: Die
Verbindung gab nach 30 Sekunden auf, obwohl ihr Aufbau länger dauern kann.

Umgesetzt ist das im Beispiel von
[`libp2p-webrtc-qr` v0.2.0](https://github.com/NiKrause/libp2p-webrtc-qr/releases/tag/v0.2.0);
was es für diese App bedeutet, steht in
[Issue #23](https://github.com/Le-Space/yogasuci/issues/23).

## Ein Verbindungs-Check, bevor es klemmt — da

Wenn eine Verbindung nicht zustande kam, sah man nur, dass sie nicht zustande
kam. Woran es lag — Browser, Netz, Kamera — musste man raten, an der Theke, mit
wartenden Leuten. Auf dem Verbindungsbildschirm steht das jetzt vorher, jede
Zeile grün, orange oder rot:

- **Browser** — kann er WebRTC überhaupt? Es gibt Browser, die es nicht können,
  und dann hilft kein Netz der Welt.
- **IPv4** und **IPv6** — getrennt, weil es das auch ist. Eine der beiden reicht,
  und über IPv6 gelingt manches, woran IPv4 hinter dem Netz des Anbieters
  scheitert.
- **Kamera** — ist sie freigegeben? Ohne sie fällt das QR-Scannen aus.
- **Ergebnis** — grün, sobald eine der beiden Adressfamilien es ist.

Wer die App bewusst mit `?ice=host` betreibt, bekommt keine roten Zeilen,
sondern gar keine Netz-Zeilen: Das ist eine Einstellung, keine Störung, und eine
Einstellung als Fehler zu melden ist schlimmer als zu schweigen. Browser und
Kamera bleiben auch dort stehen — die beiden gehen an der Theke genauso kaputt,
ob STUN nun eingeschaltet ist oder nicht.

**Die Kamera wird gefragt, nicht ausprobiert.** Der Check liest den
Berechtigungsstatus und schaltet die Kamera nie ein — sonst stünde beim Öffnen
der Seite genau die Abfrage auf dem Schirm, über die er berichten soll. Wo ein
Browser diesen Status nicht herausgibt (Safari, Stand heute), steht **orange**
und dabei, dass es sich erst beim Versuch zeigt. Das ist ehrliches Nichtwissen,
keine Warnung.

**Eine TURN-Zeile gibt es nicht**, und sie ist auch nicht vergessen worden. Ein
TURN-Server ist eine zentrale Stelle, durch die der Verkehr zweier Geräte läuft
— das Gegenteil dessen, wofür diese App gebaut ist. Was ohne ihn nicht geht,
steht unter [Was die App nicht kann](/what-it-cannot-do) und wird dort nicht
schöngeredet.

**Das Mikrofon wird ebenfalls bewusst nicht geprüft.** Die App fordert es nie an;
ein rotes Licht dafür würde vor etwas warnen, das nichts kaputtmachen kann.

Was der Check **nicht** kann, und das gehört dazu: Dass eine Adressfamilie
nutzbar ist, heißt nicht, dass sich diese zwei Geräte finden. Die Ampel zeigt, ob
die Voraussetzungen stimmen — nicht, ob es klappt.

## Sicherung auf dezentralem Speicher

Heute liegt eure Sicherung dort, wo ihr sie hinlegt: Der **Export** lädt eine Datei
herunter, und wo die landet, entscheidet ihr. Ohne Server gibt es dazu keine
Alternative — es gibt niemanden, bei dem etwas läge.

Das ist tragfähig, aber es hat eine unangenehme Kante: Gehen **alle** Geräte eines
Studios zugleich verloren — Diebstahl, Brand, Wasserschaden — dann existiert nur
noch, was jemand exportiert und weggelegt hat.

Geplant ist deshalb eine **optionale** Sicherung auf dezentralem Speicher, etwa
über **Filecoin**. Optional in einem strengen Sinn: Ein Studio, das das nicht will,
verliert keine Funktion. Wer es einschaltet, bekommt eine Kopie, die einen
Totalverlust der Geräte übersteht.

### Woran es gerade hängt

Ein Modul dafür ist bereits geschrieben:
[`orbitdb-storage-bridge`](https://github.com/NiKrause/orbitdb-storage-bridge).
Es zerlegt eine OrbitDB-Datenbank in ihre Blöcke — Log-Einträge, Manifest,
Identitäten, Zugriffsrechte — lädt sie einzeln hoch und setzt sie beim
Wiederherstellen so zusammen, dass die ursprüngliche Identität erhalten bleibt.
Genau das ist der schwierige Teil: Eine Sicherung, die die Identität verliert,
ergibt eine Datenbank, deren alte Einträge niemand mehr prüfen kann.

Der Haken war: Das Modul lud über die Infrastruktur von **Storacha** hoch, und
Storacha existiert als Unternehmen nicht mehr. Inzwischen ist das Modul
umgestellt: Seit Version 0.7.0 (September 2026) heißt es
`orbitdb-storage-bridge` und sichert über austauschbare Speicher-Anbieter.
Angebunden sind Aleph und Pinata; Pinata ist gegen ein echtes Konto getestet,
das Wiederherstellen eingeschlossen. Offen ist die Einbindung hier. Das ist Arbeit
an einer bekannten Stelle, kein offener Entwurf — aber sie ist getan, wenn sie
getan ist, und deshalb steht hier kein Datum.

### Was dabei bedacht werden muss

Eine Kopie auf fremdem Speicher wirft genau die Fragen auf, die diese App sonst
nicht hat, und sie sind vor der Umsetzung zu beantworten:

- **Wer kann sie lesen?** Eine unverschlüsselte Sicherung auf öffentlichem Speicher
  wäre das Gegenteil dessen, wofür diese App gebaut ist. Verschlüsselung ist hier
  keine Zutat, sondern Voraussetzung — und anders als bei den geteilten
  Datenbanken ist sie hier einfach, weil es genau **eine** lesende Stelle gibt: das
  Studio (siehe die Aufstellung in `docs/PRIVACY.md`).
- **Was passiert mit einer Löschanfrage?** Was auf verteiltem Speicher liegt, lässt
  sich nicht zurückholen. Der gangbare Weg ist, den Schlüssel zu vernichten statt
  die Daten — das setzt voraus, dass von Anfang an verschlüsselt wird.
- **Ändert es das Datenschutzverhältnis?** Heute verarbeitet niemand außer euch
  etwas. Ein Speicheranbieter wäre eine dritte Stelle — und dann stellt sich die
  Frage nach einem Auftragsverarbeitungsvertrag, die es derzeit ausdrücklich nicht
  gibt. Auch das gehört geklärt, bevor der Schalter existiert.

## Eine Seite für die Fragen davor

Das Handbuch erklärt, wie man die App bedient. Was fehlt, sind die Fragen, die
davor kommen — und die stellt jede Person, der man diese App zum ersten Mal
zeigt: _Wo ist mein Passwort? Wo liegen meine Daten? Was, wenn ich das Telefon
verliere?_

Ohne Antworten darauf liest sich „kein Server, kein Account" wie ein Mangel
statt wie die Eigenschaft, die es ist. Geplant ist deshalb eine FAQ, die sieben
Dinge beantwortet: was ein Passkey ist und worin er sich von einem Passwort
unterscheidet; warum es keine Accounts gibt und wo der Passkey stattdessen
liegt; wie das ohne Server überhaupt gehen kann; ob man einen Passkey verlieren
kann; warum die Privatsphäre hier anders geschützt ist; wo genau die Daten
liegen; und wo verschlüsselt wird.

Drei dieser Antworten haben eine unangenehme Stelle, und die tragen sie:

- **Einen Passkey kann man verlieren.** Ohne Server gibt es niemanden, der
  „Passwort vergessen" beantwortet. Heute schützt davor der Export — und ein
  Passkey in einem synchronisierenden Passwortmanager übersteht den
  Geräteverlust, einer im Sicherheitschip des Geräts nicht. Daran wird
  gearbeitet: [p2pass](https://github.com/asabya/p2pass) soll eine
  Wiederherstellung möglich machen, ohne dafür eine zentrale Stelle
  einzuführen.
- **Auf dem Gerät wird heute nicht verschlüsselt.** Unterwegs immer — jede
  Verbindung ist verschlüsselt und die Gegenstelle signiert nachweisbar. Aber
  die Datenbanken liegen unverschlüsselt im Browserspeicher. Wer ein
  entsperrtes Gerät in die Hand bekommt, liest mit; Sperrbildschirm und
  Geräteverschlüsselung leisten hier mehr, als die App könnte.
- **Buchungen werden heute an Mitschüler repliziert.** Die eine Stelle, an der
  die App fremde personenbezogene Daten verteilt. Der Weg dahin ist bekannt —
  eine Buchungsdatenbank pro Schüler statt einer gemeinsamen — und solange er
  offen ist, gehört er in die FAQ und nicht nur ins technische Dokument.

Einzelheiten in
[Issue #33](https://github.com/Le-Space/yogasuci/issues/33).

## Was sonst noch offen ist

- **Reihen-Tickets für einzelne Termine.** Eine Reihe lässt sich buchen; eine
  einzelne Stunde daraus zu verkaufen, fehlt noch.
- **Datenschutzinformation für Schüler.** Eine Vorlage, die ein Studio anpassen und
  aushändigen kann — verantwortlich seid ihr, nicht wir.
- **Löschkonzept.** Die Logs sind append-only. Was das für eine Löschanfrage
  bedeutet, ist offen und wird nicht schöngeredet.

Der vollständige, technische Stand steht im
[Projektarchiv](https://github.com/Le-Space/yogasuci) — dort auch alles, was hier
zu klein für ein eigenes Kapitel ist.
