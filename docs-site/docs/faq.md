---
title: Häufige Fragen
sidebar_position: 5
---

# Häufige Fragen

Die Fragen, die jeder stellt, dem man diese App zum ersten Mal zeigt. Ohne
Antworten klingt „kein Server, kein Konto" wie ein Mangel — es ist aber genau
die Eigenschaft, um die es geht.

Stand: 7. August 2026. Wo sich etwas ändert, ändert sich diese Seite mit.

## Was ist ein Passkey, und wie unterscheidet er sich von einem Passwort?

Ein Passwort ist ein **gemeinsames Geheimnis**: Du kennst es, die Gegenseite
kennt es, und beide können es verlieren. Genau deshalb gibt es Phishing und
deshalb sind gestohlene Passwortdatenbanken ein Geschäft.

Ein Passkey ist ein **Schlüsselpaar**. Die private Hälfte verlässt dein Gerät
nie. Übertragen wird nur eine Unterschrift, und die gilt immer nur für das eine,
was gerade unterschrieben wurde.

Es gibt hier also nichts, was man dir abschwatzen könnte, und nichts, was
irgendwo in einer Datenbank läge und gestohlen werden könnte.

## Warum gibt es keine Konten? Wo liegt der Passkey?

Der Passkey liegt dort, wo dein Gerät seine Schlüssel verwahrt — Secure Enclave,
TPM, Hardware-Schlüssel oder Passwort-Manager. Nicht in der App, nicht im
Browserspeicher.

Der entscheidende Punkt zum Verstehen: **Es meldet sich niemand irgendwo an.**
Es gibt keine Gegenstelle, die sagt „ja, das bist du". Deine Unterschrift
berechtigt einen Eintrag in ein Buch, und jedes andere Gerät prüft sie selbst
nach.

Ein Konto wäre eine Zeile in einer Tabelle auf einem Server. Es gibt weder
Tabelle noch Server.

## Wie kann das ohne Server funktionieren?

Weil nichts zentral **nachgeschlagen** wird.

Jede Karte ist eine Kette unterschriebener Ereignisse, an die nur angehängt
wird. Ein Guthaben wird nie gespeichert, sondern immer aus dieser Kette
berechnet — deshalb kommen zwei Standorte unabhängig voneinander auf dieselbe
Zahl, ohne miteinander zu sprechen.

Und der Schüler trägt den Abgleich selbst: Sein Gerät bringt sein eigenes Buch
von einem Standort zum nächsten mit.

## Kann man einen Passkey verlieren?

**Ja. Das ist die ehrliche Kante dieser Bauweise.**

Ohne Server gibt es niemanden, der „Passwort vergessen" beantwortet. Wer den
Passkey verliert, verliert den Zugang zu dem, was damit unterschrieben wurde.

Was heute hilft:

- **Der Export.** Sichert eure Daten regelmäßig — siehe
  [Sicherung anlegen](/studio/setup).
- **Wo der Passkey liegt, entscheidet mit.** Einer im Passwort-Manager, der
  zwischen euren Geräten abgleicht, überlebt den Verlust des Telefons. Einer in
  der Secure Enclave des Geräts nicht.
- **Mehrere Geräte.** Ein Studio, das ein zweites Gerät freigegeben hat, verliert
  mit einem Gerät nicht sein Studio.

Für Schüler ist der Schaden begrenzt: Das Ticket-Buch gehört dem Studio, das es
verkauft hat. Eine gekaufte Karte ist also nicht weg, wenn das Telefon weg ist —
sie muss nur wieder zugeordnet werden.

An einer echten Lösung wird gearbeitet, ohne dafür eine zentrale Stelle
einzuführen. Bis dahin ist diese Frage nur teilweise beantwortet, und das sagen
wir lieber, als es zu umschreiben.

## Warum ist die Privatsphäre hier besonders geschützt?

Weil es keine dritte Partei gibt, die etwas verarbeitet. Kein Anbieter, kein
Auftragsverarbeitungsvertrag, keine Statistik, kein Backup bei jemand anderem.

Das ist keine Zusage, sondern eine Bauweise: Es gibt keinen Ort, an dem die
Daten aller Studios zusammenlaufen — deshalb kann es auch keinen geben, der
verloren geht oder verkauft wird.

<div class="no-server">

**Was Mitschüler sehen — und was nicht**
Bis Juli 2026 replizierte die App eine gemeinsame Buchungsliste an alle Schüler.
Wer buchte, sah, wer sonst noch in der Stunde ist. Das ist umgestellt: Jeder
Schüler hat sein eigenes Buchungsbuch, und was bleibt, ist ein reiner Zähler —
„noch 4 Plätze frei", ohne dass jemand erfährt, **wer** die anderen acht sind.

</div>

## Wo genau liegen meine Daten?

Auf den Geräten. Im Speicher des Browsers (IndexedDB), sonst nirgends. Auf
keinem Server, in keiner Cloud, in keinem Backup außer dem, das ihr selbst
exportiert.

| Was                                    | Wer hat es                                                    |
| -------------------------------------- | ------------------------------------------------------------- |
| Studio, Standorte, freigegebene Geräte | Studio-Geräte, und jedes Schülergerät, das sich verbunden hat |
| Kursplan und Preise                    | dieselben                                                     |
| Deine Buchungen                        | dein Gerät und die Studio-Geräte                              |
| Deine Karten                           | die Geräte des Studios, das sie verkauft hat, und dein Gerät  |

Der vollständige Bestand — welches Feld personenbezogen ist und wer es
repliziert — steht im [Datenschutz-Kapitel](/privacy) und ausführlich im
Projektarchiv unter `docs/PRIVACY.md`.

## Was ist verschlüsselt, was nicht?

Die Frage, bei der Raten am teuersten wäre. Deshalb genau:

**Unterwegs: immer.** Jede Verbindung zwischen zwei Geräten ist verschlüsselt
(DTLS, wie bei einem Videoanruf). Dass wirklich das Gerät am anderen Ende ist,
das ihr gescannt habt, garantiert die Unterschrift auf der Einladung.

**Dein Signaturschlüssel: ja.** Der Schlüssel, mit dem dein Gerät unterschreibt,
liegt verschlüsselt und wird einmal pro Sitzung durch den Passkey entsperrt.

**Die Datenbanken auf dem Gerät: nein.** Kursplan, Buchungen und Karten liegen
unverschlüsselt im Browserspeicher. Wer ein **entsperrtes** Gerät in die Hand
bekommt, liest mit. Dagegen helfen Sperrbildschirm und Geräteverschlüsselung
mehr, als die App könnte — deshalb steht das auch in unserer
Datenschutzerklärung und nicht im Kleingedruckten.

**Wo sie hingehört und noch fehlt:** in eine Sicherung auf fremdem Speicher.
Dort ist Verschlüsselung Voraussetzung und obendrein einfach, weil es genau
einen Leser gibt.

**Wo sie nichts brächte:** bei den Zugriffsregeln und Datenbank-Kennungen. Die
enthalten keine personenbezogenen Daten, und sie zu verschlüsseln würde die
Nachprüfbarkeit kosten, die die Unterschriften erst wertvoll macht.

**Und was Verschlüsselung hier grundsätzlich nicht leistet:** Sie verbirgt den
**Inhalt** eines Eintrags, nicht seine **Existenz**. Wie oft jemand eincheckt,
bliebe auch verschlüsselt sichtbar.
