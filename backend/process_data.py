#!/usr/bin/env python3
"""
process_data.py
================
Converts the raw PWS CSV file into spatially-chunked JSON tiles
for efficient lazy-loading on the static frontend.

Input:
    A CSV with columns: base_filename_key, lon, lat, PWS, Psw_score
    (e.g., aggregated_pixel_ratios.csv with 73k–400k+ rows)

Output:
    frontend/data/manifest.json    — index of tiles + global metadata
    frontend/data/overview.json    — sampled points for low-zoom view
    frontend/data/tiles/<col>_<row>.json — full-resolution spatial chunks

Design:
    The bounding box of all points is divided into a GRID_SIZE x GRID_SIZE
    grid. Each cell becomes a tile JSON. The frontend only fetches tiles
    intersecting the current map viewport, keeping memory and bandwidth low.
    A coarse "overview" file is loaded immediately to populate the city-wide
    view at low zoom levels.

Usage:
    python process_data.py --input ../path/to/data.csv
    python process_data.py --input data.csv --grid 16 --overview-step 10

Part of the UrbanPulse open-source urban walkability platform.
Originally developed for street-level Perceived Walkability Scores; the
output schema (manifest + tiles + overview) is now optional — UrbanPulse
boots without any pre-baked dataset and can pull live OSM data per city.
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

import pandas as pd

log = logging.getLogger("urbanpulse.process_data")

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
DEFAULT_GRID_SIZE = 16        # 16 x 16 = 256 tiles
DEFAULT_OVERVIEW_STEP = 10    # keep 1 in N points for the overview tile
DEFAULT_COORD_DECIMALS = 5    # ~1.1 m precision
DEFAULT_SCORE_DECIMALS = 2

# Path resolution: assume script lives in <repo>/backend/
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DEFAULT_OUTPUT_DIR = REPO_ROOT / "frontend" / "data"


# ---------------------------------------------------------------------------
# Core processing
# ---------------------------------------------------------------------------
def load_and_clean(csv_path: Path) -> pd.DataFrame:
    """Load CSV and drop rows with invalid coordinates or scores."""
    log.info("Reading %s", csv_path)
    df = pd.read_csv(csv_path)

    required = {"lon", "lat", "Psw_score"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(
            f"CSV missing required columns: {missing}. "
            f"Found: {list(df.columns)}"
        )

    n0 = len(df)
    df = df.dropna(subset=["lon", "lat", "Psw_score"])
    df = df[(df["lat"].between(-90, 90)) & (df["lon"].between(-180, 180))]
    n1 = len(df)
    if n0 != n1:
        log.info("Dropped %s invalid rows (%s remaining)", f"{n0 - n1:,}", f"{n1:,}")

    return df.reset_index(drop=True)


def round_columns(
    df: pd.DataFrame,
    coord_decimals: int = DEFAULT_COORD_DECIMALS,
    score_decimals: int = DEFAULT_SCORE_DECIMALS,
) -> pd.DataFrame:
    df = df.copy()
    df["lon"] = df["lon"].round(coord_decimals)
    df["lat"] = df["lat"].round(coord_decimals)
    df["Psw_score"] = df["Psw_score"].round(score_decimals)
    return df


def compute_bounds(df: pd.DataFrame) -> dict[str, float]:
    """Compute the bounding box of the dataset."""
    return {
        "min_lon": float(df["lon"].min()),
        "max_lon": float(df["lon"].max()),
        "min_lat": float(df["lat"].min()),
        "max_lat": float(df["lat"].max()),
    }


def compute_score_stats(df: pd.DataFrame) -> dict[str, float]:
    s = df["Psw_score"]
    return {
        "min": float(s.min()),
        "max": float(s.max()),
        "mean": float(s.mean()),
        "median": float(s.median()),
        "p25": float(s.quantile(0.25)),
        "p75": float(s.quantile(0.75)),
        "p90": float(s.quantile(0.90)),
        "count": int(len(s)),
    }


def assign_tile_indices(
    df: pd.DataFrame,
    bounds: dict[str, float],
    grid_size: int,
) -> pd.DataFrame:
    """Add 'col' and 'row' columns indicating which grid tile each point belongs to."""
    df = df.copy()
    lon_span = bounds["max_lon"] - bounds["min_lon"]
    lat_span = bounds["max_lat"] - bounds["min_lat"]

    # Avoid division by zero for degenerate datasets
    lon_span = lon_span if lon_span > 0 else 1e-9
    lat_span = lat_span if lat_span > 0 else 1e-9

    df["col"] = ((df["lon"] - bounds["min_lon"]) / lon_span * grid_size).astype(int)
    df["row"] = ((df["lat"] - bounds["min_lat"]) / lat_span * grid_size).astype(int)

    # Clamp the max edge into the last cell
    df["col"] = df["col"].clip(0, grid_size - 1)
    df["row"] = df["row"].clip(0, grid_size - 1)
    return df


def write_overview(df: pd.DataFrame, output_dir: Path, step: int) -> dict[str, Any]:
    """Write a sampled overview file used for low-zoom rendering."""
    overview = df.iloc[::step][["lon", "lat", "Psw_score"]]
    rows = overview.values.tolist()
    path = output_dir / "overview.json"
    with path.open("w") as f:
        json.dump(rows, f, separators=(",", ":"))
    log.info(
        "overview.json — %s points (%.1f KB)",
        f"{len(rows):,}", path.stat().st_size / 1024,
    )
    return {"path": "overview.json", "count": len(rows), "step": step}


def write_tiles(
    df: pd.DataFrame,
    output_dir: Path,
    grid_size: int,
    bounds: dict[str, float],
) -> list[dict[str, Any]]:
    """Group points by (col,row), write one JSON per non-empty tile.

    Writes to a temporary directory first, then atomically swaps it in once
    every tile is on disk — a mid-run crash leaves the previous tile set
    intact rather than producing a manifest that points to deleted files.
    """
    tiles_dir = output_dir / "tiles"
    staging = Path(tempfile.mkdtemp(prefix=".tiles.staging.", dir=output_dir))

    try:
        lon_span = bounds["max_lon"] - bounds["min_lon"]
        lat_span = bounds["max_lat"] - bounds["min_lat"]
        cell_lon = lon_span / grid_size
        cell_lat = lat_span / grid_size

        tiles_meta: list[dict[str, Any]] = []
        grouped = df.groupby(["col", "row"], sort=False)

        log.info("Writing %s tile files…", f"{grouped.ngroups:,}")
        for (col, row), group in grouped:
            rows = group[["lon", "lat", "Psw_score"]].values.tolist()
            filename = f"{col}_{row}.json"
            path = staging / filename
            with path.open("w") as f:
                json.dump(rows, f, separators=(",", ":"))

            tiles_meta.append({
                "col": int(col),
                "row": int(row),
                "file": f"tiles/{filename}",
                "count": len(rows),
                "bounds": {
                    "min_lon": round(bounds["min_lon"] + col * cell_lon, 6),
                    "max_lon": round(bounds["min_lon"] + (col + 1) * cell_lon, 6),
                    "min_lat": round(bounds["min_lat"] + row * cell_lat, 6),
                    "max_lat": round(bounds["min_lat"] + (row + 1) * cell_lat, 6),
                },
            })

        if tiles_dir.exists():
            shutil.rmtree(tiles_dir)
        staging.rename(tiles_dir)

        total_size = sum((tiles_dir / t["file"].split("/")[-1]).stat().st_size
                         for t in tiles_meta)
        log.info("Tiles total: %.2f MB", total_size / 1024 / 1024)
        return tiles_meta
    except Exception:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        raise


def write_manifest(
    output_dir: Path,
    bounds: dict[str, float],
    score_stats: dict[str, float],
    grid_size: int,
    overview_meta: dict[str, Any],
    tiles_meta: list[dict[str, Any]],
    source_file: str,
) -> None:
    manifest = {
        "version": "1.0",
        "generated_at": pd.Timestamp.now("UTC").isoformat(),
        "source": source_file,
        "bounds": bounds,
        "grid_size": grid_size,
        "score_stats": score_stats,
        "overview": overview_meta,
        "tiles": tiles_meta,
    }
    path = output_dir / "manifest.json"
    tmp = path.with_suffix(".json.tmp")
    with tmp.open("w") as f:
        json.dump(manifest, f, indent=2)
    tmp.replace(path)
    log.info(
        "manifest.json — %s tiles indexed (%.1f KB)",
        f"{len(tiles_meta):,}", path.stat().st_size / 1024,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert a walkability-score CSV into spatial tiles for the UrbanPulse frontend."
    )
    parser.add_argument(
        "--input", "-i", required=True, type=Path,
        help="Path to the input CSV file."
    )
    parser.add_argument(
        "--output-dir", "-o", type=Path, default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR})."
    )
    parser.add_argument(
        "--grid", type=int, default=DEFAULT_GRID_SIZE,
        help=f"Grid size NxN (default: {DEFAULT_GRID_SIZE})."
    )
    parser.add_argument(
        "--overview-step", type=int, default=DEFAULT_OVERVIEW_STEP,
        help=f"Keep 1 in N points for the overview (default: {DEFAULT_OVERVIEW_STEP})."
    )
    parser.add_argument(
        "--verbose", "-v", action="count", default=0,
        help="Increase log verbosity (-v info, -vv debug).",
    )
    parser.add_argument(
        "--quiet", "-q", action="store_true",
        help="Suppress all logs below WARNING.",
    )
    args = parser.parse_args()

    level = logging.WARNING if args.quiet else (
        logging.DEBUG if args.verbose >= 2 else logging.INFO
    )
    logging.basicConfig(level=level, format="%(message)s")

    if not args.input.exists():
        log.error("input file not found: %s", args.input)
        return 1

    args.output_dir.mkdir(parents=True, exist_ok=True)

    log.info("=" * 64)
    log.info(" UrbanPulse · Walkability-score tile processor")
    log.info("=" * 64)

    log.info("[1/5] Loading data")
    df = load_and_clean(args.input)
    df = round_columns(df)

    log.info("[2/5] Computing bounds & statistics")
    bounds = compute_bounds(df)
    score_stats = compute_score_stats(df)
    log.info(
        "Bounds: lon [%.4f, %.4f], lat [%.4f, %.4f]",
        bounds["min_lon"], bounds["max_lon"],
        bounds["min_lat"], bounds["max_lat"],
    )
    log.info(
        "Scores: mean=%.2f, median=%.2f, p90=%.2f",
        score_stats["mean"], score_stats["median"], score_stats["p90"],
    )

    log.info("[3/5] Assigning grid cells (%s x %s)", args.grid, args.grid)
    df = assign_tile_indices(df, bounds, args.grid)

    log.info("[4/5] Writing overview")
    overview_meta = write_overview(df, args.output_dir, args.overview_step)

    log.info("[5/5] Writing spatial tiles")
    tiles_meta = write_tiles(df, args.output_dir, args.grid, bounds)

    log.info("Writing manifest")
    write_manifest(
        args.output_dir, bounds, score_stats, args.grid,
        overview_meta, tiles_meta,
        source_file=str(args.input.name),
    )

    log.info("=" * 64)
    log.info(" Done. Output written to: %s", args.output_dir)
    log.info("=" * 64)
    return 0


if __name__ == "__main__":
    sys.exit(main())
