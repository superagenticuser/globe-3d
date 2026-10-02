# 🌍 Terra — Interactive 3D Globe

An interactive 3D globe in the browser — built with Three.js (bundled locally, no CDN needed), plain CSS, and vanilla JavaScript.

## Play

**Live:** https://superagenticuser.github.io/globe-3d/

Works on phone and desktop.

## Features

- Real Earth imagery (NASA Visible Earth): 4K day map, night city lights, starfield
- **Live day/night terminator** — the sun position is computed from the real UTC time and date
- Ocean sun-glint, warm sunset band on the terminator, atmosphere glow
- Drag to spin (with inertia), scroll / pinch to zoom, auto-rotation when idle (slows as you zoom)
- 14 city markers with pulsing dots — tap to fly to the city and see local time, population, coordinates
- City search with fly-to
- **Live traffic layers** (toggleable, top right):
  - 🛰 Satellites — **real-time positions** from CelesTrak TLE data (ISS highlighted with ground tracks); simulated shell if the feed is unreachable
  - ✈ Planes — simulated scheduled flights between cities (time ×60)
  - 🚢 Ships — simulated along major shipping lanes (time ×600)
- Subtle graticule, glassmorphism HUD, safe-area aware on phones

## Run locally

Serve the folder over HTTP (ES modules don't work from `file://`):

```bash
npx serve .
```

## Files

- `index.html` — page, HUD, search, city card
- `styles.css` — dark space UI styling
- `app.js` — scene, shaders, markers, interaction (ES module)
- `three.module.min.js` — Three.js r160, bundled locally
- `satellite.min.js` — satellite.js v5 (SGP4 propagation), bundled locally
- `textures/` — NASA Visible Earth imagery (4K Blue Marble day, night lights, starfield)

Deployed with GitHub Pages from the `main` branch.
