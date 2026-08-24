---
title: Datenschutz
sidebar_position: 30
---

# Datenschutz

## Was wo liegt

| Daten                      | Liegen auf                          |
| -------------------------- | ----------------------------------- |
| Studio, Standorte, Geräte  | allen verbundenen Geräten           |
| Kurse und Preise           | allen verbundenen Geräten           |
| Buchungen eines Schülers   | seinem Gerät und den Studio-Geräten |
| Kartenkonto eines Schülers | seinem Gerät und den Studio-Geräten |

Es gibt **keine** Stelle, an der alles zusammenläuft. Kein Anbieter, kein
Auswertungsdienst, keine Statistik, die irgendwohin fließt.

## Was Schüler voneinander sehen

Nichts. Ein Schülergerät bekommt fremde Buchungen und fremde Karten nicht — es
erhält ihre Adressen gar nicht erst. Bei den freien Plätzen steht eine Zahl, keine
Namensliste.

Das war einmal anders. Bis zum 29. Juli 2026 sah der Entwurf eine gemeinsame
Buchungsliste je Standort vor, die jeder Schüler vollständig repliziert hätte —
mitsamt allen anderen Buchungen. Das wurde geändert, bevor jemand die App
benutzt hat.

## Was die Studio-Geräte sehen

Alles über ihre Schüler: Buchungen, Käufe, jeden einzelnen Besuch mit Datum und
Standort. Das ist notwendig — ohne dieses Wissen lässt sich weder einchecken noch
abrechnen — aber es ist auch mehr, als eine Papierliste je enthalten hat.

Über die Geräte selbst entsteht nebenbei eine Art **Beschäftigungsverlauf**:
Wann ein Gerät freigegeben und wann es widerrufen wurde, steht in der Registry und
ist für alle lesbar.

## Datensparsamkeit, praktisch

- **Kein Klarname nötig.** Ein Alias reicht.
- **Keine E-Mail-Adresse nötig.** Beim Anlegen des Passkeys frei wählbar.
- **Geräte nach dem Gerät benennen**, nicht nach der Person: „iPad Empfang"
  statt „Marias iPad".
- **Keine Lehrerinnennamen in Kurstiteln** — Kurstitel gehen an alle.
- **Gesundheitsbezogene Kurse** (Rückbildung, Reha, Prävention) sagen etwas über
  den Gesundheitszustand aus. Behandelt diese Listen entsprechend.

## Was beim Verbinden über die Ferne passiert

Ein per Messenger geteilter Verbindungscode enthält die Netzwerkadressen eures
Geräts. Im Studio nutzt den QR-Code — er verlässt den Raum nicht.

## „Woher weiß ich, dass ihr wirklich nichts speichert?"

Die berechtigte Frage. „Kein Server" ist eine Behauptung, und Behauptungen über
Datenschutz sind billig. Hier steht, was ihr selbst nachprüfen könnt — und
ebenso deutlich, wo das Nachprüfen aufhört.

### Wo läuft diese App überhaupt?

Nirgends, jedenfalls nicht bei uns. Was ihr benutzt, ist ein Bündel aus HTML,
JavaScript und Bildern, das im **IPFS**-Netz liegt. `yogasuci.le-space.de` ist
kein Rechner von uns, sondern ein Verweis auf ein öffentliches Gateway, das
diese Dateien ausliefert.

Ein Gateway ist eine Art Kopiergerät: Es reicht die Dateien durch, mehr nicht.
Es sieht nicht, was ihr in der App tut, weil die App danach direkt zwischen
euren Geräten arbeitet. Eure Buchungen laufen nie über das Gateway, und wir
könnten sie dort auch nicht abholen.

### Wie prüfe ich das ohne Fachwissen?

Drei Dinge, die keine Technikkenntnisse verlangen.

**Erstens: schaltet das Netz ab.** Öffnet die App, wartet bis sie geladen ist,
und schaltet dann Flugmodus ein. Sie läuft weiter — Kurse, Buchungen, Karten.
Eine App, die ihre Daten bei einem Anbieter hätte, wäre an dieser Stelle leer.

**Zweitens: holt dieselbe App woanders her.** Jede Auslieferung bekommt eine
**CID** — eine Prüfsumme des gesamten Inhalts. Dieselbe CID über ein Gateway,
das uns nicht gehört:

- [dweb.link](https://bafybeicvgquga6sy273jm76fnmrs3oqjpmqdyifeuk7ilpjxadt3sv6bji.ipfs.dweb.link/)
  (betrieben von Protocol Labs)

Wenn dort dieselbe App erscheint, kann sie nicht von einem Server von uns
abhängen — dieses Gateway kennt uns nicht.

**Drittens: fragt die Domain, worauf sie zeigt.**

```
dig +short TXT _dnslink.yogasuci.le-space.de
```

Die Antwort nennt genau die CID, die gerade ausgeliefert wird. Ändern wir die
App, ändert sich die CID; eine andere CID ist ein anderer Inhalt. Das ist keine
Vertrauensfrage, sondern Rechnen.

### Welche Fassung ist gerade ausgeliefert?

Stand 24. August 2026:

| Was          | Wert                                                                              |
| ------------ | --------------------------------------------------------------------------------- |
| CID          | `bafybeicvgquga6sy273jm76fnmrs3oqjpmqdyifeuk7ilpjxadt3sv6bji`                     |
| Commit       | [`6fcf1801`](https://github.com/Le-Space/yogasuci/commit/6fcf1801)                |
| Auslieferung | [Lauf 32747804930](https://github.com/Le-Space/yogasuci/actions/runs/32747804930) |

Diese Tabelle veraltet mit der nächsten Auslieferung — die DNS-Abfrage oben
nennt immer die aktuelle. Jeder [Auslieferungslauf](https://github.com/Le-Space/yogasuci/actions/workflows/deploy.yml)
trägt seit dem 24. August 2026 oben eine Zusammenfassung mit Commit, CID und
Gateway-Links, damit die Kette vom Quelltext bis zu dem, was euer Browser lädt,
Schritt für Schritt begehbar ist.

### Beweist das, dass ihr keine Daten sammelt?

**Nein.** Diese Grenze soll hier stehen, weil sie sonst jemand für euch
überschreitet.

Bewiesen ist: Die App kommt aus dem IPFS-Netz, wir betreiben keinen Server, der
sie ausliefert, und der ausgelieferte Inhalt steht als Prüfsumme fest. Nicht
bewiesen ist, dass dieser Inhalt nicht heimlich etwas sendet. Eine Prüfsumme
sagt, _dass_ etwas unverändert ist, nicht _was_ es tut.

Dafür gibt es zwei andere Wege. Der [Quelltext](https://github.com/Le-Space/yogasuci)
ist vollständig offen — wer programmieren kann, liest nach. Und wer das nicht
kann, öffnet im Browser die Entwicklerwerkzeuge (F12), Reiter „Netzwerk", und
sieht jede Verbindung, die die App aufbaut. Nach dem Laden sollte dort außer den
Verbindungen zu euren eigenen Geräten nichts stehen.

Ehrlicherweise fehlt ein Stück: Aus dem Quelltext ergibt sich nicht
zwangsläufig **byte-genau** die ausgelieferte CID, weil unser Bauvorgang nicht
darauf ausgelegt ist, reproduzierbar zu sein. Nachvollziehbar ist die Kette über
das öffentliche Bauprotokoll — welcher Commit welche CID ergeben hat —, nicht
durch eigenes Nachbauen. Das zu ändern wäre eine Verbesserung und ist
aufgeschrieben.

### Was bringt mir IPFS Companion?

[IPFS Companion](https://docs.ipfs.tech/install/ipfs-companion/) ist eine
Browser-Erweiterung, die mit einem eigenen IPFS-Knoten auf eurem Rechner
zusammenarbeitet. Ist beides installiert, holt der Browser die App **am Gateway
vorbei** direkt aus dem Netz.

Damit fällt der letzte Vermittler weg: Nicht einmal das öffentliche Gateway
sieht dann noch, dass jemand diese App geladen hat. Für den Alltag braucht es
das nicht — für die Frage „läuft das wirklich ohne Server?" ist es die
deutlichste Antwort, die man selbst herstellen kann.

Eine ausführlichere Einführung zu diesem Ansatz steht in der
[FAQ zu Local-First](https://local-first.le-space.de/#faq).

## Die ausführliche Fassung

Die vollständige Aufstellung — welche Felder personenbezogen sind, was
Verschlüsselung daran ändern würde und was offen ist — steht in
[`docs/PRIVACY.md`](https://github.com/Le-Space/yogasuci/blob/main/docs/PRIVACY.md).
Sie ist als Vorarbeit für ein Verarbeitungsverzeichnis geschrieben und ersetzt
keine Rechtsberatung.
