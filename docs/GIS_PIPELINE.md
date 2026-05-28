# GIS pipeline

The end-to-end transformation that turns a city name (a string) into a
ready-to-render walkability layer (vector tiles + JSON score cards).

```
   "Delhi"
      │
      ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. Geocode                                                   │
│    services.nominatim.search("Delhi")                        │
│    → osm_id, osm_type, bbox, polygon ref                     │
└──────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. Boundary extraction                                       │
│    osmnx.geocode_to_gdf({"osm_id": ..., "osm_type": ...})    │
│    → MultiPolygon (WGS84) cached as PostGIS row              │
└──────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. Road / footpath network                                   │
│    osmnx.graph_from_place(name, network_type="walk")         │
│      • re-projected to local UTM                             │
│      • simplified (consolidate_intersections, tol=15m)       │
│      • split into edges + nodes GeoDataFrames                │
│    Persisted to:                                             │
│      • networks (edges)  in PostGIS                          │
│      • cache/osmnx/<osm_id>.graphml.pkl  on disk             │
└──────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. Amenity layer                                             │
│    osmnx.features_from_place(name, tags={                    │
│       "amenity":     ["school","clinic","hospital",          │
│                       "pharmacy","bus_station","cafe"],      │
│       "highway":     ["bus_stop","crossing"],                │
│       "leisure":     ["park","playground"],                  │
│       "shop":        True,                                   │
│       "railway":     ["station","subway_entrance"],          │
│    })                                                        │
│    → amenities table (one row per POI, indexed by H3 + GIST) │
└──────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. Spatial framework — H3                                    │
│    Tessellate the boundary with H3 resolution 9 (~174 m).    │
│    Each cell gets:                                           │
│      • cell_id (h3 string, primary key)                      │
│      • centroid (geometry, srid 4326)                        │
│      • polygon  (geometry, srid 4326)                        │
└──────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────┐
│ 6. Dimension scoring (per H3 cell)                           │
│                                                              │
│   A. Connectivity                                            │
│      • intersection_density = nodes_in_cell / area_km²       │
│      • mean_block_size      = mean perimeter of network      │
│                                blocks intersecting the cell  │
│      • network_density      = Σ edge_length / area_km²       │
│      → connectivity_score (0–100) via reference percentiles  │
│                                                              │
│   B. Pedestrian infrastructure                               │
│      • sidewalk_coverage = Σ length(edges with                │
│           highway=footway OR sidewalk=*) / Σ length(edges)   │
│      • crossing_density  = count(highway=crossing) / km²     │
│      • traffic_calming   = count(traffic_calming=*) / km²    │
│      → ped_infra_score                                       │
│                                                              │
│   C. Accessibility (gravity model, decay τ=10 min)           │
│      • For each amenity class c: a_c = Σ exp(-t_ic / τ)      │
│        over all amenities of class c, where t_ic is walking  │
│        time from cell i (NetworkX shortest_path on the       │
│        contracted graph).                                    │
│      • Normalised across all cells in the city.              │
│      → accessibility_score                                   │
│                                                              │
│   D. Safety                                                  │
│      • light_density   = count(highway=street_lamp) / km²    │
│      • road_class_mix  = 1 - share of length on              │
│                          (primary | trunk | motorway)        │
│      • osm_incident_proxy: places tagged crossing=traffic_   │
│        signals on major roads count positively.              │
│      → safety_score                                          │
│                                                              │
│   E. Environment                                             │
│      • tree_cover_ratio = area(natural=tree, landuse=forest) │
│                           / area(cell)                       │
│      • shade_proxy      = tree_cover_ratio × building_height │
│                           factor                             │
│      • pollution_overlay: optional raster from open AQI feed │
│      → environment_score                                     │
│                                                              │
│   Final cell score:                                          │
│      score = Σ w_d × dim_score_d  for d ∈ {A,B,C,D,E}        │
│      with Σ w_d = 1 (user-editable, defaulted to             │
│      0.25 / 0.25 / 0.20 / 0.15 / 0.15).                      │
└──────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────┐
│ 7. Aggregation                                               │
│    • Ward score = area-weighted mean of H3 cell scores       │
│      where ward polygons are OSM admin_level=10 (or 9).      │
│    • City score = area-weighted mean of ward scores.         │
│    → scores table rows (one per (osm_id, scope, scope_id)).  │
└──────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────┐
│ 8. Tile generation                                           │
│    • Emit a single GeoJSON-Lines file:                       │
│      {properties: {h3, score, c, p, a, s, e}}                │
│    • tippecanoe -zg --extend-zooms-if-still-dropping         │
│         --no-tile-size-limit -o city.pmtiles                 │
│    • Uploaded to the static CDN under                        │
│      /tiles/{osm_id}.pmtiles                                 │
└──────────────────────────────────────────────────────────────┘
      │
      ▼
   MapLibre + deck.gl render the PMTiles archive directly via
   HTTP range requests — no tile server required.
```

## Determinism + idempotency

- Scoring inputs are uniquely identified by:
  `(osm_id, osm_data_timestamp, weights_hash, code_version)`.
- A re-run with the same inputs is short-circuited via Redis.
- A new OSM update bumps `osm_data_timestamp`; old tiles are kept until
  the new ones are ready (atomic swap).

## Failure modes

| Failure | Strategy |
|---------|----------|
| Nominatim returns nothing | Fall back to Photon, then surface "no match" |
| OSMnx graph download times out | Retry with smaller `network_type='walk_basic'` |
| Country lacks `highway=footway` tagging | Use `highway=*` minus motorway / trunk; mark cells with `low_data: true` |
| Boundary polygon is invalid | `make_valid()`, then warn |
| H3 indexing OOM | Fall back to resolution 8 (~566 m cells) |

## Reference data sources (all free)

- **OSM** — primary source, ODbL.
- **GHSL (Global Human Settlement Layer)** — population grid for
  cross-city normalisation, JRC license.
- **OpenAQ** — air-quality overlay, CC-BY.
- **Mapillary** — street-level imagery (Phase 6), CC-BY-SA.
- **NASA SRTM / Copernicus DEM** — terrain (Phase 7).

## CLI: bootstrap a city locally

```bash
python -m gis.scripts.bootstrap_city --city "Lisbon, Portugal"
```

Runs steps 1–8 sequentially against a local PostGIS, writes PMTiles to
`gis/data/tiles/`, and prints the city score breakdown.
