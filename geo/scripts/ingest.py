"""Manifest-driven ingest of the real data under DATA_DIR (data/, mounted
read-only at /data/raw): loads app.manifest.VECTORS into PostGIS via
ogr2ogr and converts app.manifest.RASTERS to COGs. Reuses the same core
functions as the HTTP routers (import_local_file, process_raster_file) so
behavior matches POST /vector/import and POST /raster/process exactly.

Idempotent and safe to re-run:
- Vector loads use `-overwrite` (see app/routers/vector.py), replacing the
  target table each run.
- Raster conversion skips gdal.Translate if the COG already exists (see
  app/routers/raster.py); stats and the manifest.json entry are still
  refreshed so a partial prior run is repaired.
- imported_layers rows are upserted by (name, kind), not appended.

Run inside the geo container:
    python -m scripts.ingest
"""
import os
import sys
import traceback

from app.manifest import RASTERS, VECTORS
from app.routers.raster import process_raster_file
from app.routers.vector import extract_geojson_from_js, import_local_file

DATA_DIR = os.environ.get("DATA_DIR", "/data/raw")


def _abs(rel_path: str) -> str:
    return os.path.join(DATA_DIR, rel_path)


def run_vectors() -> list[dict]:
    results = []
    for entry in VECTORS:
        table = entry["table"]
        rel_path = entry["path"]
        src_path = _abs(rel_path)
        tmp_path = None
        try:
            if not os.path.exists(src_path):
                raise FileNotFoundError(src_path)

            source = src_path
            if entry.get("js_wrapper"):
                tmp_path = extract_geojson_from_js(src_path)
                source = tmp_path

            result = import_local_file(source, table, source_label=rel_path)
            results.append({"table": table, "path": rel_path, "ok": True, **result})
            print(f"[vector] {table}: {result['feature_count']} rows (from {rel_path})")
        except Exception as exc:
            results.append({"table": table, "path": rel_path, "ok": False, "error": str(exc)})
            print(f"[vector] {table}: FAILED - {exc}", file=sys.stderr)
            traceback.print_exc()
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
    return results


def run_rasters() -> list[dict]:
    results = []
    for entry in RASTERS:
        name = entry["name"]
        rel_path = entry["path"]
        src_path = _abs(rel_path)
        try:
            if not os.path.exists(src_path):
                raise FileNotFoundError(src_path)

            catalog_entry = process_raster_file(
                src_path,
                name,
                title=entry.get("title"),
                categorical=entry.get("categorical", False),
            )
            results.append({"path": rel_path, "ok": True, **catalog_entry})
            mins = ",".join(f"{v:.3f}" for v in catalog_entry["min"])
            maxs = ",".join(f"{v:.3f}" for v in catalog_entry["max"])
            print(f"[raster] {name}: bands={catalog_entry['bands']} min=[{mins}] max=[{maxs}] (from {rel_path})")
        except Exception as exc:
            results.append({"name": name, "path": rel_path, "ok": False, "error": str(exc)})
            print(f"[raster] {name}: FAILED - {exc}", file=sys.stderr)
            traceback.print_exc()
    return results


def main() -> int:
    print(f"== vector ingest (DATA_DIR={DATA_DIR}) ==")
    vector_results = run_vectors()

    print("== raster ingest ==")
    raster_results = run_rasters()

    print("\n== summary ==")
    for r in vector_results:
        if r.get("ok"):
            print(f"vector {r['table']}: ok ({r.get('feature_count')} rows)")
        else:
            print(f"vector {r['table']}: FAILED ({r.get('error')})")
    for r in raster_results:
        name = r.get("name")
        if r.get("ok"):
            print(f"raster {name}: ok (bands={r.get('bands')} min={r.get('min')} max={r.get('max')})")
        else:
            print(f"raster {name}: FAILED ({r.get('error')})")

    failed = [r for r in vector_results + raster_results if not r.get("ok")]
    if failed:
        print(f"\n{len(failed)} of {len(vector_results) + len(raster_results)} sources failed", file=sys.stderr)
        return 1
    print(f"\nall {len(vector_results) + len(raster_results)} sources ingested")
    return 0


if __name__ == "__main__":
    sys.exit(main())
