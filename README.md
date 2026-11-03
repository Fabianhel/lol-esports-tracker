# LoL Esports Tracker

Fürs Handy gebaute Web-App (PWA): Damit verfolgst du LoL-Esports-Spiele live, siehst Spielplan und Tabellen – gefiltert nach **Region** und **Event/Liga**.

## Funktionen
- **Live**: laufende Matches mit Serienstand, danach die nächsten und zuletzt gespielten Matches (aktualisiert sich alle 30 s).
- **Spielplan**: nach Tagen gruppiert, springt automatisch zu „Heute“, frühere und spätere Spiele lassen sich nachladen.
- **Tabellen**: Rangliste je Turnier und Phase (z. B. Swiss, Gruppen, Saison); in den Playoffs werden die Bracket-Matches gezeigt. Ältere Turniere sind über das Dropdown erreichbar.
- **Match-Details** (Match antippen): Spiele der Serie und Live-Statistik des Spiels – Kills, Gold und Golddifferenz, Türme, Inhibitoren, Barons, Drachen sowie Spieler mit Champion, KDA, CS und Gold. Dazu ein Link zum Stream.
- **Filter**: Regionen (International, Europa, Korea, China, …) und darunter die einzelnen Ligen/Events.
- **Favoriten**: Über ☆ oben rechts Ligen markieren; der Filter „★ Favoriten“ zeigt dann nur diese.
- Uhrzeiten in deiner lokalen Zeitzone, dunkles Design, lässt sich installieren und startet auch offline.

## Android-App mit Live-Stand auf dem Sperrbildschirm
Die Android-App kann alles, was die Web-App kann. Zusätzlich lässt sich ein Match **verfolgen**:
Match öffnen → **📌 Verfolgen**. Danach zeigt eine dauerhafte Benachrichtigung (auch auf dem Sperrbildschirm) den Stand:

```
GEN 1 : 0 FNC · Spiel 2
Kills: 9–5 · Gold +3,3k (GEN)
🐉 2 – 1 · Baron 1–0
```

- Aktualisierung etwa alle 15 s, solange ein Spiel läuft
- **Widget** für den Startbildschirm (lange auf den Startbildschirm drücken → Widgets → „LoL Esports Live“)
- Am Ende kommt eine Benachrichtigung mit dem Endergebnis, danach stoppt die Verfolgung von selbst
- Benachrichtigung oder Widget antippen öffnet das Match in der App
- **Vormerken:** Matches bis zu 24 h vor Beginn mit 📌 markieren. Die App startet den Live-Stand dann automatisch 15 Min. vor dem geplanten Start (funktioniert auch nach einem Neustart des Handys)

**Installieren:** [lol-esports.apk herunterladen](https://github.com/Fabianhel/lol-esports-tracker/releases/latest/download/lol-esports.apk) und auf dem Handy öffnen.
Beim ersten Mal fragt Android, ob dein Browser bzw. die Dateien-App Apps installieren darf. Das musst du erlauben.
Wenn eine neue Version erscheint, zeigt die App oben einen Hinweis an.

Die APK baut GitHub Actions bei jedem Push auf `main` (`.github/workflows/android.yml`) und veröffentlicht sie als Release.

### Optional: eigener Signierschlüssel
Ohne eigenen Schlüssel wird die APK mit einem Debug-Schlüssel signiert, den der Build zwischenspeichert.
Wird dieser Zwischenspeicher gelöscht (passiert nach etwa 7 Tagen ohne Build), lässt sich die nächste Version nicht über die alte installieren. Dann muss die alte App vorher deinstalliert werden.
Mit einem eigenen Schlüssel als Repo-Secret passiert das nie:
`ANDROID_KEYSTORE_BASE64` (Keystore als Base64), `ANDROID_KEYSTORE_PASSWORD` und optional `ANDROID_KEY_ALIAS` (Standard: `lolesports`).

## Web-App aufs Handy bringen
Die App muss über **HTTPS** erreichbar sein, z. B. über GitHub Pages:
1. Im Repo unter *Settings → Pages* bei „Branch“ `main` und `/ (root)` wählen, *Save* drücken.
2. Danach liegt die App unter `https://fabianhel.github.io/lol-esports-tracker/`.
3. Die Seite auf dem Handy öffnen:
   - **iPhone (Safari):** Teilen → „Zum Home-Bildschirm“
   - **Android (Chrome):** Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“

Lokal testen: `python3 -m http.server 8000` und dann <http://localhost:8000> öffnen.

## Datenquelle
Die Daten kommen von der inoffiziellen, öffentlichen API, die auch lolesports.com nutzt:
`esports-api.lolesports.com` für Ligen, Spielplan, Live und Tabellen sowie `feed.lolesports.com` für die Live-Statistiken. Champion-Bilder stammen von Riot Data Dragon.
Diese API ist nicht offiziell dokumentiert und kann sich jederzeit ändern.

## Dateien
| Datei | Inhalt |
| --- | --- |
| `index.html` | Grundgerüst |
| `app.js` | UI-Logik (Tabs, Filter, Rendering, Match-Details) |
| `api.js` | API-Zugriff |
| `styles.css` | Design |
| `sw.js` | Service Worker (Offline-Cache) |
| `manifest.webmanifest`, `icons/` | Installierbarkeit als App |
| `android/` | Android-App (Capacitor), u. a. `LiveTrackerService.java` (Benachrichtigung) und `LiveWidgetProvider.java` (Widget) |
| `scripts/build-web.mjs` | kopiert die Web-App nach `www/` für Capacitor |
