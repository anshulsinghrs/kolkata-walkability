# Database schema — PostgreSQL + PostGIS

Schema for the Phase 2+ persistence layer. SRID is 4326 (WGS84) for all
geometry columns; spatial indexes are GiST. Run Alembic migrations to
apply.

## Extensions

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- fuzzy search on city names
CREATE EXTENSION IF NOT EXISTS h3;          -- h3-pg for hex indexing
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()
```

## Core tables

### `cities`

The canonical record for every searched city. Population is **optional**
(filled in from GHSL when available).

```sql
CREATE TABLE cities (
    id              BIGSERIAL PRIMARY KEY,
    osm_id          BIGINT      NOT NULL,
    osm_type        TEXT        NOT NULL CHECK (osm_type IN ('node','way','relation')),
    name            TEXT        NOT NULL,
    display_name    TEXT        NOT NULL,
    country_code    CHAR(2),
    admin_level     SMALLINT,
    population_est  INTEGER,
    area_km2        NUMERIC(10,2),
    boundary        GEOMETRY(MultiPolygon, 4326) NOT NULL,
    bbox            GEOMETRY(Polygon, 4326)      NOT NULL,
    centroid        GEOMETRY(Point, 4326)        NOT NULL,
    osm_data_at     TIMESTAMPTZ NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (osm_type, osm_id)
);
CREATE INDEX cities_boundary_gist ON cities USING GIST (boundary);
CREATE INDEX cities_centroid_gist ON cities USING GIST (centroid);
CREATE INDEX cities_name_trgm     ON cities USING GIN  (name gin_trgm_ops);
```

### `network_edges`

Edges of the walk network as extracted by OSMnx, projected back to
WGS84 for storage.

```sql
CREATE TABLE network_edges (
    id              BIGSERIAL PRIMARY KEY,
    city_id         BIGINT      NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    osm_way_id      BIGINT,
    u_node          BIGINT      NOT NULL,
    v_node          BIGINT      NOT NULL,
    highway         TEXT,                       -- footway, residential, etc.
    has_sidewalk    BOOLEAN     NOT NULL DEFAULT false,
    has_crossing    BOOLEAN     NOT NULL DEFAULT false,
    surface         TEXT,
    lit             BOOLEAN,
    length_m        NUMERIC(10,2) NOT NULL,
    geom            GEOMETRY(LineString, 4326) NOT NULL
);
CREATE INDEX network_edges_geom_gist ON network_edges USING GIST (geom);
CREATE INDEX network_edges_city      ON network_edges (city_id);
CREATE INDEX network_edges_highway   ON network_edges (highway);
```

### `network_nodes`

Intersections / dead-ends — used for connectivity scoring.

```sql
CREATE TABLE network_nodes (
    id              BIGSERIAL PRIMARY KEY,
    city_id         BIGINT      NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    osm_node_id     BIGINT      NOT NULL,
    degree          SMALLINT    NOT NULL,
    geom            GEOMETRY(Point, 4326) NOT NULL,
    UNIQUE (city_id, osm_node_id)
);
CREATE INDEX network_nodes_geom_gist ON network_nodes USING GIST (geom);
```

### `amenities`

POIs relevant to walkability. `class` is one of a controlled set
(`school`, `clinic`, `hospital`, `pharmacy`, `transit_stop`, `park`,
`shop`, `cafe`, `library`, `playground`, …).

```sql
CREATE TABLE amenities (
    id              BIGSERIAL PRIMARY KEY,
    city_id         BIGINT      NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    osm_id          BIGINT      NOT NULL,
    osm_type        TEXT        NOT NULL,
    class           TEXT        NOT NULL,
    subclass        TEXT,
    name            TEXT,
    tags            JSONB       NOT NULL DEFAULT '{}',
    geom            GEOMETRY(Point, 4326) NOT NULL,
    h3_r9           H3INDEX     NOT NULL,
    UNIQUE (osm_type, osm_id)
);
CREATE INDEX amenities_geom_gist ON amenities USING GIST (geom);
CREATE INDEX amenities_city      ON amenities (city_id);
CREATE INDEX amenities_class     ON amenities (class);
CREATE INDEX amenities_h3        ON amenities (h3_r9);
```

### `score_cells`

The H3 spatial framework + per-cell scores. One row per `(city_id, h3)`.

```sql
CREATE TABLE score_cells (
    id              BIGSERIAL PRIMARY KEY,
    city_id         BIGINT      NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    h3              H3INDEX     NOT NULL,
    h3_res          SMALLINT    NOT NULL,
    polygon         GEOMETRY(Polygon, 4326) NOT NULL,
    centroid        GEOMETRY(Point, 4326)   NOT NULL,
    area_km2        NUMERIC(10,4) NOT NULL,
    low_data        BOOLEAN     NOT NULL DEFAULT false,
    UNIQUE (city_id, h3)
);
CREATE INDEX score_cells_polygon_gist ON score_cells USING GIST (polygon);
```

### `scores`

The per-cell / per-ward / per-city score breakdown. `weights_hash`
fingerprints the indicator weights used so that user-driven recompute
results can be cached without colliding with the default.

```sql
CREATE TABLE scores (
    id              BIGSERIAL PRIMARY KEY,
    city_id         BIGINT      NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    scope           TEXT        NOT NULL CHECK (scope IN ('cell','ward','city')),
    scope_id        TEXT        NOT NULL,        -- h3 / OSM admin id / 'city'
    weights_hash    CHAR(16)    NOT NULL,
    connectivity    NUMERIC(5,2) NOT NULL,
    ped_infra       NUMERIC(5,2) NOT NULL,
    accessibility   NUMERIC(5,2) NOT NULL,
    safety          NUMERIC(5,2) NOT NULL,
    environment     NUMERIC(5,2) NOT NULL,
    total           NUMERIC(5,2) NOT NULL,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (city_id, scope, scope_id, weights_hash)
);
CREATE INDEX scores_lookup ON scores (city_id, scope, weights_hash);
```

### `wards`

Administrative subdivisions (OSM `boundary=administrative`,
`admin_level` 9 / 10).

```sql
CREATE TABLE wards (
    id              BIGSERIAL PRIMARY KEY,
    city_id         BIGINT      NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    osm_id          BIGINT      NOT NULL,
    admin_level     SMALLINT    NOT NULL,
    name            TEXT        NOT NULL,
    geom            GEOMETRY(MultiPolygon, 4326) NOT NULL,
    UNIQUE (city_id, osm_id)
);
CREATE INDEX wards_geom_gist ON wards USING GIST (geom);
```

### `audits` (Phase 8)

Crowdsourced street audits.

```sql
CREATE TABLE audits (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id),
    city_id         BIGINT      REFERENCES cities(id) ON DELETE SET NULL,
    location        GEOMETRY(Point, 4326) NOT NULL,
    sidewalk_score  SMALLINT    CHECK (sidewalk_score BETWEEN 0 AND 5),
    safety_score    SMALLINT    CHECK (safety_score BETWEEN 0 AND 5),
    accessibility   SMALLINT    CHECK (accessibility BETWEEN 0 AND 5),
    issue_type      TEXT,
    notes           TEXT,
    photo_url       TEXT,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audits_geom_gist ON audits USING GIST (location);
CREATE INDEX audits_city      ON audits (city_id);
```

### `cv_detections` (Phase 6)

Detections from Mapillary imagery.

```sql
CREATE TABLE cv_detections (
    id              BIGSERIAL PRIMARY KEY,
    city_id         BIGINT      NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    image_id        TEXT        NOT NULL,        -- Mapillary image id
    class           TEXT        NOT NULL,        -- sidewalk, tree, pole, ...
    confidence      NUMERIC(4,3) NOT NULL,
    geom            GEOMETRY(Point, 4326) NOT NULL,
    bbox            JSONB,                       -- pixel bbox + image dims
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cv_detections_geom_gist ON cv_detections USING GIST (geom);
CREATE INDEX cv_detections_class     ON cv_detections (class);
```

### `users` (Phase 8)

```sql
CREATE TABLE users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT      NOT NULL UNIQUE,
    role            TEXT        NOT NULL DEFAULT 'user',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `simulations` (Phase 7)

```sql
CREATE TABLE simulations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        REFERENCES users(id),
    city_id         BIGINT      NOT NULL REFERENCES cities(id),
    name            TEXT,
    edits           JSONB       NOT NULL,         -- list of edit operations
    baseline_score  NUMERIC(5,2) NOT NULL,
    new_score       NUMERIC(5,2) NOT NULL,
    delta           NUMERIC(5,2) GENERATED ALWAYS AS (new_score - baseline_score) STORED,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Materialised views

For the public city-comparison dashboard:

```sql
CREATE MATERIALIZED VIEW city_score_ranking AS
SELECT c.id, c.name, c.country_code, s.total, s.connectivity,
       s.ped_infra, s.accessibility, s.safety, s.environment
  FROM cities c
  JOIN scores s ON s.city_id = c.id
 WHERE s.scope = 'city' AND s.weights_hash = '00000000default0';
CREATE INDEX city_score_ranking_total ON city_score_ranking (total DESC);
```

Refreshed nightly via Celery beat.

## Partitioning

`network_edges`, `score_cells`, and `scores` are partitioned by
`city_id` once we cross ~50 cities. Until then, a single table is
fine — PostGIS BRIN indexes on geometry are an additional option.
