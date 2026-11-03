// Kopiert die Web-App (liegt im Repo-Root, damit GitHub Pages sie direkt ausliefert) nach www/ für Capacitor.
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const files = ['index.html', 'styles.css', 'app.js', 'api.js', 'manifest.webmanifest', 'sw.js', 'icons'];
rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const f of files) cpSync(f, `www/${f}`, { recursive: true });
console.log('www/ aktualisiert');
