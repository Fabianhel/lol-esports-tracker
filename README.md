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

## Aufs Handy bringen
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
