# KS Player

Moderner IPTV-Player für Windows (Electron + React + TypeScript) mit allen gängigen Funktionen
eines IPTV-Players wie IBO Player Pro:

- **Playlists**: M3U/M3U8-URL, lokale Datei oder **Xtream Codes** (Server, Benutzer, Passwort);
  mehrere Playlists, Auto-Refresh, Ablaufdatum & Verbindungen (Xtream), eigener User-Agent
- **Live TV** mit Kategorien (Mehrfachauswahl per Shift/Strg + Klick), Kanalnummern, Zapping (↑/↓, PageUp/PageDown, Ziffern),
  Kanalliste im Vollbild, Vorschau-Player, Favoriten, Sortierung, Suche
- **Filme (VOD)** und **Serien** (Staffeln/Episoden, auch aus M3U per „S01E02“-Erkennung),
  Detailseiten mit Handlung/Besetzung (Xtream), **Weiterschauen** (Resume-Position)
- **EPG / TV-Guide** (XMLTV, auch .gz, Xtream-EPG), Jetzt/Danach in der Kanalliste, Zeitleiste,
  Catch-up / Timeshift (Xtream `timeshift.php` und M3U `catchup-source`)
- **Player**: HLS (hls.js), MPEG-TS (mpegts.js), MP4/MKV/WebM nativ, einstellbare Pufferung (2–20 s,
  Vorpufferung vor dem Start und nach Aussetzern), automatischer
  **Kompatibilitätsmodus mit ffmpeg** (z. B. AC3/EAC3-Ton, exotische Container), Tonspuren,
  Untertitel, Bildformat, Geschwindigkeit, Bild-in-Bild, Vollbild, Sleep-Timer, Immer-im-Vordergrund
- **Multi-Screen** (2×2, 1+3, 2×1) mit Audio-Auswahl je Kachel
- **Kindersicherung** (PIN, gesperrte Kategorien), ausgeblendete Kategorien
- Verlauf, Favoriten, Sicherung (Export/Import), Themes (Dunkel/Hell/AMOLED, Akzentfarbe),
  Deutsch/Englisch, Autostart mit Windows, letzten Kanal automatisch starten

## Starten

```bash
start.cmd
```

`start.cmd` installiert bei Bedarf die Abhängigkeiten, baut die App und startet sie.
Alternativ manuell:

```bash
npm install
npm run build
npx electron .
```

Entwicklung mit Hot-Reload:

```bash
npm run dev
```

## Installer / portable EXE bauen

```bash
npm run dist
```

Das Ergebnis liegt danach unter `release/` (NSIS-Installer und portable EXE, ffmpeg wird
mitgeliefert).

## Tastenkürzel

| Taste | Funktion |
|---|---|
| Leertaste / K | Pause / Weiter |
| F | Vollbild, Enter: Player groß |
| M | Stumm |
| ↑ / ↓, PageUp / PageDown | Kanal wechseln |
| ← / → | 10 s spulen (VOD) |
| 0–9 | Kanalnummer eingeben |
| + / − | Lautstärke |
| Esc oder „Zurück“-Button | Player verkleinern / zurück ins Menü |

## Daten

Playlists, Favoriten, Verlauf und Einstellungen liegen unter
`%APPDATA%\KS Player\ks-data`. `public/sample.m3u` ist eine Demo-Playlist mit freien Test-Streams.
