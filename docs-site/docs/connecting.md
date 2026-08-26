---
title: Verbinden
sidebar_position: 10
---

# Zwei Geräte verbinden

Es gibt keinen Server, der Geräte zusammenbringt. Das übernimmt ein Mensch: Er
trägt eine kurze, unterschriebene Einladung von einem Gerät zum anderen. Danach
sprechen die Geräte direkt miteinander.

Die Einladung ist schon da, wenn ihr den Schirm öffnet. Ihr müsst sie nicht
erzeugen — an der Theke, mit jemandem davor, zählt jeder Handgriff.

## Zwei Wege, dieselbe Einladung

**Der QR-Code** — der Weg im Studio. Das andere Gerät scannt ihn, und mehr ist es
nicht.

**Der Link** — wenn ihr nicht am selben Ort seid. **Einladung teilen** öffnet das
gewohnte Teilen-Menü; die andere Seite tippt den Link an, und ihr Gerät antwortet
von selbst.

Das ist kein Entweder-oder: Der QR-Code **enthält denselben Link**. Es ist eine
Einladung in zwei Formen, nicht die Wahl zwischen zwei Verfahren.

![Verbinden](/img/screens/de/connect.png)

## Die Antwort muss zurück

Eine Verbindung braucht zwei Schritte, und das ist der, den man vergisst. Wer eine
Einladung öffnet, erzeugt eine **Antwort** — sein Schirm zeigt sie danach genauso,
wie eure Einladung angezeigt wurde. Diese Antwort muss zurück: scannen lassen oder
zurückschicken. Erst dann steht die Verbindung.

Der Schirm sagt euch dabei, woran ihr seid. Nach einem gelungenen Scan steht dort
**„Code gelesen und geprüft"** — ihr müsst nicht raten, ob die Kamera ihn erwischt
hat. Und der Code, der danach zu sehen ist, trägt über sich **Antwort** statt
**Einladung**: dieselbe Stelle, andere Bedeutung.

Sobald die Verbindung steht, verschwindet der Code. Das ist Absicht — er ist
verbraucht, und ein Bild, das stehen bleibt, sieht aus, als sei nichts passiert.
Kommt gleich noch ein Gerät dazu, holt ihr mit **Weiteres Gerät verbinden** eine
frische Einladung auf den Schirm.

Kommt die Antwort per Messenger zurück und ihr tippt sie an, öffnet der Browser
meist einen **neuen Tab**. Das ist in Ordnung. Er reicht die Antwort an das Tab
weiter, in dem die Einladung entstanden ist, und sagt euch, dass er geschlossen
werden kann. Verbunden wird dort, wo ihr angefangen habt.

## Eine Einladung ist zehn Minuten gültig

Danach ist sie verfallen, und die andere Seite bekommt das gesagt. Das ist kein
Fehler, sondern Absicht: Wer einen Code abfotografiert oder einen alten Link aus
einem Chat holt, soll damit nichts mehr anfangen können.

Für den QR-Code an der Theke spielt das keine Rolle — der Schirm erneuert die
Einladung von selbst, solange er offen ist. Für einen Link, den ihr verschickt,
schon: Wird er erst nach der Mittagspause geöffnet, macht einfach einen neuen.

<div class="no-server">

**Beim Teilen über einen Messenger mitdenken**
Die Einladung enthält die Netzwerkadressen eures Geräts. Über WhatsApp oder E-Mail
geschickt, landen sie beim Betreiber und in jedem Chat, durch den der Link
weitergereicht wird. Der empfindliche Teil steht zwar hinter dem `#` und wird
deshalb an keinen Webserver geschickt — aber der Messenger sieht die Zeichenkette,
die ihr ihm gebt. Im Studio ist der QR-Code der bessere Weg: Er verlässt den Raum
nicht.

</div>

## Erweitert: Kopieren und Einfügen

Unter **Erweitert** liegt der Textweg. Er ist für ein Gerät ohne Kamera und ohne
Teilen-Menü — ein älteres Tablet an der Theke etwa. Text kopieren, auf dem anderen
Gerät einfügen, Antwort zurücktragen.

Er liegt bewusst nicht offen: Zwei sichtbare Wege nebeneinander führen zu der
Frage, welche der beiden Zeichenketten denn nun die richtige ist — und genau die
sollte niemand stellen müssen.

## Erweitert: Kurzer Code

Fällt euch auf, dass der QR-Code nicht stillsteht, sondern durch mehrere Bilder
läuft? Das ist Absicht: Die Einladung ist länger, als in ein einzelnes Bild
passt, also wird sie in eine Bildfolge zerlegt. Zu scannen ist das kein Problem —
aber das Telefon muss einen Moment lang ruhig gehalten werden.

Unter **Erweitert** gibt es dafür den Schalter **Kurzer Code**. Damit wird
dasselbe verschickt, nur dichter gepackt: rund ein Viertel der Zeichen, und
daraus wird ein einziges stehendes Bild. An der Theke ist das ein Blick statt
einer kurzen Choreografie.

Er ist trotzdem aus, solange ihn niemand einschaltet, und der Grund ist nicht,
dass er unfertig wäre. In Messungen des zugrundeliegenden Pakets blieb unter Last
etwa jede zweite so aufgebaute Verbindung stumm — verbunden, ohne Fehlermeldung,
aber es kam nichts an. Für ein Kassenbuch ist das der schlechteste denkbare
Fehler: Zwei Geräte sehen verbunden aus, während die auf dem einen verkauften
Karten das andere nie erreichen. In unseren eigenen Läufen ist das bisher nicht
aufgetreten; wir halten den Schalter aus, bis wir mehr als „bisher nicht" sagen
können.

**Lesen könnt ihr kurze Codes immer.** Der Schalter ändert nur, was _dieses_
Gerät ausgibt. Ein Gerät mit dem Schalter aus scannt problemlos den kurzen Code
eines Geräts, das ihn anhat, und antwortet im selben Format.

Wenn eine Verbindung damit still bleibt: Schalter aus, **Einladung erneuern**,
neu verbinden. Verloren geht dabei nichts.

## Warum eine Verbindung über die Ferne manchmal scheitert

Im Studio ist das kein Thema: Zwei Geräte im selben WLAN finden sich immer. Über
die Ferne kann es scheitern, und der Grund liegt nicht an der App, sondern daran,
wie das Internet für Privatanschlüsse gebaut ist.

**Fast niemand ist direkt erreichbar.** Euer Telefon hat keine Adresse, unter der
es von außen angerufen werden kann. Dazwischen sitzt ein **NAT** — ein Gerät im
Router oder beim Anbieter, das viele Anschlüsse hinter einer gemeinsamen Adresse
bündelt. Damit zwei Geräte sich trotzdem direkt erreichen, verabreden sie über
den ausgetauschten Code, wer wo anklopft. Das gelingt meistens.

**Manche Netze lassen das nicht zu.** Mobilfunk arbeitet oft mit einem NAT, das
für jede Verbindung einen anderen Zugang öffnet — dann ist die Verabredung
wertlos, weil die Adresse schon nicht mehr stimmt, wenn die Gegenseite anklopft.
Sitzen **beide** Seiten in solchen Netzen, hilft kein Code der Welt.

**Hotel-, Gäste- und Firmen-WLAN** sind der zweite Fall. Sie sperren häufig alles
außer dem Surfen und trennen die Gäste zusätzlich voneinander, damit niemand die
Geräte der anderen sieht. Genau das braucht diese App aber.

**Und der Browser urteilt mit.** Ob euer Gerät sich für erreichbar hält, hängt
auch davon ab, welchen Browser ihr benutzt. Dasselbe Telefon im selben WLAN kann
in zwei Browsern zu verschiedenen Schlüssen kommen. Deshalb ist die Warnung
neben dem Teilen-Knopf eine Aussage über _diesen Browser_, nicht über euer Netz.

### Was ihr dagegen tun könnt

Der Reihe nach, vom Einfachsten:

1. **Im selben Raum scannen.** Der QR-Code braucht kein Internet, nur das
   gemeinsame Netz. Das ist der Weg, für den die App gebaut ist.
2. **Ins WLAN wechseln**, wenn eine Seite im Mobilfunk hängt. Oft reicht es,
   wenn _eine_ der beiden Seiten erreichbar ist.
3. **Den Relay einschalten.** Auf dem Verbindungs-Schirm, gleich unter der
   Netz-Anzeige. Dann vermittelt ein Server die Verbindung, wenn direkt nichts
   geht.

### Was der Relay ist, und was er kostet

Ein Relay ist eine Vermittlungsstelle. Es ersetzt den QR-Code **nicht** — den
braucht ihr weiterhin, um euch das erste Mal zu verbinden. Was es ersetzt, ist
der direkte Weg: Erreichen sich zwei Geräte nicht, läuft die Verbindung über das
Relay, bis die beiden einen direkten Pfad finden.

Der Preis steht in einem Satz: Das Relay erfährt, **dass** zwei Geräte zueinander
wollen, und **ihre IP-Adressen**. Es erfährt nicht, was sie austauschen — das
bleibt zwischen den Geräten verschlüsselt. Deshalb ist es aus, bis jemand es
einschaltet, und deshalb ruft ein Gerät ohne diese Wahl niemanden an.

Die Wahl wirkt beim nächsten Start der App.

### Woran wir arbeiten

Der ehrliche Stand: Für den Fall „beide hinter Mobilfunk-NAT" gibt es derzeit
keine Lösung, die ohne fremde Hilfe auskommt. Der Relay ist die Antwort darauf,
die wir haben — funktionierend, aber eine Vermittlungsstelle, die man einschalten
muss und der man etwas preisgibt. Wir suchen weiter nach etwas Besserem. Bis
dahin gilt: Im Studio scannen, über die Ferne den Relay.

Was ein eingeschalteter Relay preisgibt, steht vollständig im
[Datenschutz-Abschnitt](/privacy).

## Wenn es nicht klappt

**Der QR-Code lässt sich nicht scannen.** Displayhelligkeit hochdrehen, Abstand
20–30 cm, dem Autofokus einen Moment lassen. Sonst: Link teilen oder der Textweg
unter **Erweitert**.

**Neben dem Teilen-Knopf steht eine Warnung.** Dann hat euer Gerät festgestellt,
dass es von diesem Netz aus niemanden draußen erreicht — typisch für Mobilfunk.
Der QR-Code bleibt trotzdem gültig: **im selben Raum verbindet ihr euch weiterhin**,
denn dafür braucht es kein Netz nach draußen. Nur ein verschickter Link kommt
dann meist nicht an. Abhilfe: ins WLAN wechseln, oder vor Ort scannen lassen.

Die Warnung ist eine Aussage über _diesen Browser_, nicht über euer Netz.
Dasselbe Telefon im selben WLAN urteilt in zwei Browsern verschieden.

**„Diese Antwort gehört zu einer Einladung, die dieses Tab nicht erzeugt hat."**
Ihr habt einen Antwort-Link geöffnet, aber das Tab mit der Einladung ist zu — nach
einem Neustart etwa. Fangt neu an: neue Einladung, neu teilen.

**Es verbindet nicht über größere Entfernung.** Manche Internetanschlüsse lassen
zwei Geräte nicht direkt zueinander. Im Studio, im selben WLAN, ist das kein
Thema; über die Ferne kann es scheitern. Die App sagt das, statt endlos zu
drehen. Mehr unter [Was die App nicht kann](/what-it-cannot-do).

## Verbindung beenden

Auf dem Verbindungs-Schirm gibt es **Verbindung beenden**.

Nutzt das an der Theke. Eine offene Verbindung gleicht weiter ab, auch wenn der
Schüler längst gegangen ist. Es geht nichts verloren — beim nächsten Mal wird neu
gekoppelt.
