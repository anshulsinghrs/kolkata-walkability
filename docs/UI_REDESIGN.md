# UI redesign — React + Vite + TypeScript

This document scopes the Phase 4 frontend rewrite. The goal is a typed
SPA that feels like a smart-city dashboard and a planner's tool at once —
without losing the focus-on-the-map aesthetic of the current site.

## Screens

```
                          ┌───────────────────────┐
                          │  Top global bar       │
                          │  ┌─────────────────┐  │   logo  ·  city search  ·  user menu
                          │  └─────────────────┘  │
                          ├─────────────────────────────────────────────┐
                          │                                             │
   ┌───────────────────┐  │                                             │  ┌──────────────────┐
   │  Left rail        │  │                                             │  │  Right inspector │
   │   ↳ Layers        │  │                                             │  │   ↳ Score card   │
   │   ↳ Weights       │  │                  Map canvas                 │  │   ↳ AI insights  │
   │   ↳ Time-of-day   │  │     (MapLibre GL JS + deck.gl overlays)     │  │   ↳ Audit form   │
   │   ↳ Compare       │  │                                             │  │   ↳ Detail props │
   │   ↳ Simulate      │  │                                             │  │                  │
   │   ↳ Export        │  │                                             │  └──────────────────┘
   │   ↳ Settings      │  │                                             │
   └───────────────────┘  │                                             │
                          ├─────────────────────────────────────────────┤
                          │  Legend (collapsible)  ·  Status pill       │
                          └─────────────────────────────────────────────┘
```

The right inspector and left rail collapse on narrow screens (≤ 1024 px)
and become a single bottom sheet on phones.

## Component breakdown

```
App
├── routes/Explore (default)
│    ├── components/map/MapShell
│    │     ├── BasemapPicker
│    │     ├── deckLayers/
│    │     │     ├── RoadsLayer            (network edges)
│    │     │     ├── WalkScoreHexLayer     (H3 score cells)
│    │     │     ├── AmenitiesLayer        (icons by class)
│    │     │     ├── IsochroneLayer        (5/10/15 min)
│    │     │     ├── BuildingsLayer3D      (OSM building footprints)
│    │     │     ├── UploadPointsLayer
│    │     │     └── CvDetectionsLayer
│    │     ├── components/map/CitySearch   (port of city-search.js)
│    │     ├── components/map/MapHud       (zoom, scale, locate-me)
│    │     └── components/map/Legend
│    ├── components/panel/LeftRail
│    │     └── tabs/{Layers,Weights,Time,Compare,Simulate,Export}
│    └── components/panel/RightInspector
│          └── tabs/{Score,AI,Audit,Detail}
├── routes/City/[osm_id]          (deep-link to a specific city)
├── routes/Reports/[id]
├── routes/Audit                  (PWA-friendly audit flow)
└── routes/admin/Dashboard
```

## State (Zustand)

Four focused stores; no global one-store-fits-all. Each store maps
onto a piece of UI that can update independently.

```ts
// useCityStore — current city + OSM-derived data
{
  current: Place | null;          // Place from CitySearch
  boundary: GeoJSON | null;
  network: GeoJSON | null;
  amenities: Record<AmenityClass, GeoJSON>;
  scoreCity: CityScore | null;
}

// useLayerStore — toggles, opacity, gradients
{
  visible: Record<LayerKey, boolean>;
  opacity: Record<LayerKey, number>;
  gradient: GradientName;
  filter: { min: number; max: number };
}

// useWeightsStore — indicator weights + L1 normalisation
{
  raw: { sidewalk: number; greenery: number; ... };
  normalised: { ... };
  setWeight(key, value): void;
  reset(): void;
}

// useUploadStore — user-uploaded data
{
  rows: ParsedRow[];
  mapping: ColumnMapping;
  stats: UploadStats | null;
  ingest(file: File): Promise<void>;
  clear(): void;
}
```

## Component primitives (Tailwind)

`Button`, `Card`, `Tabs`, `Slider`, `RadioGroup`, `Select`, `Drawer`,
`Sheet`, `Tooltip`, `StatusPill`. All under
`web/src/components/ui/`, all themed via a tokens file:

```css
:root {
  --bg:         #0a0b0e;
  --panel:      rgba(20, 22, 28, 0.72);
  --accent:     #d4a574;          /* warm walnut */
  --accent-2:   #65a30d;          /* moss */
  --text:       #ecebe6;
  --text-dim:   #a3a097;
  --good:       #16a34a;
  --warn:       #ea580c;
  --bad:        #b91c1c;
}
```

The dark glassmorphism look from the current site is **kept** — it's
recognisable and matches the dashboard genre. A light theme ships in
Phase 4.1.

## Score card

The right inspector's *Score* tab is the marquee surface:

```
 ┌──────────────────────────────────────────┐
 │   Lisbon, Portugal                       │
 │   ───────────────────────────────────    │
 │            ╭───╮                         │
 │            │ 72│  Walkability Score      │
 │            ╰───╯  Top 18% globally       │
 │                                          │
 │   Connectivity      ████████░░  78       │
 │   Ped. infrastructure ███████░░ 71       │
 │   Accessibility     █████████░  86       │
 │   Safety            ██████░░░░  62       │
 │   Environment       ███████░░░  68       │
 │                                          │
 │   Strengths                              │
 │     • Dense intersection network         │
 │     • 15-min city for 84% of residents   │
 │   Weaknesses                             │
 │     • Steep streets reduce accessibility │
 │     • Sidewalk coverage 71% (target 90%) │
 │                                          │
 │   ↳ Open AI Insights ↗                   │
 └──────────────────────────────────────────┘
```

The strengths/weaknesses + AI insights button are generated by the
`/api/v1/ai/insights` endpoint (Phase 5).

## Performance budgets

| Metric | Budget |
|--------|--------|
| LCP on cold load | < 2.5 s |
| Time to interactive | < 3.5 s |
| MapLibre style first paint | < 1.0 s |
| City-search keystroke → dropdown | < 400 ms |
| City selection → map fit | < 200 ms |
| Walk-score hex layer first frame | < 1.5 s (warm cache) |
| Bundle size (initial JS, gzipped) | < 240 KB |

## Accessibility

- Full keyboard support (Tab / Esc / Enter on search, ←→ on sliders).
- ARIA labels on every interactive control.
- Colour-blind-safe palettes (viridis default for scores when chosen).
- Reduced-motion variant of all transitions.
- Screen-reader announcements for status changes ("Lisbon loaded, 4,213
  hexes scored").

## Migration shim

`web/src/legacy/leaflet-island.tsx` mounts the existing Leaflet UI in
an `<iframe>` until each panel is ported, so the React app can ship
before every feature is migrated. See [`MIGRATION.md`](MIGRATION.md).
