"""Manifest of real data sources under `data/` (mounted read-only at
DATA_DIR, default /data/raw) to ingest into PostGIS and convert to COG.
Consumed by scripts/ingest.py and by the /vector and /raster routers when
running the full pipeline. Paths are relative to DATA_DIR.

Not processed (by omission, not by explicit skip logic):
- The `.js` duplicates of the vector `.json` files (global-tectonic.js,
  global-faultlines.js): the `.json` twin is the ogr2ogr-readable source.
- `*.sr.lock`, `Thumbs.db`.
- Raster sidecars: `.tfw`, `.ovr`, `.aux.xml`, `.vat.dbf`, `.vat.cpg`, `.xml`.
  GDAL reads these implicitly alongside the `.tif`; they are never passed
  to gdal.Translate directly.
- Shapefile sidecars: `.dbf`, `.shx`, `.prj`, `.cpg`, `.sbn`, `.sbx`, `.qmd`,
  `.shp.xml`. ogr2ogr reads these alongside the `.shp`; only the `.shp` is listed.
"""

VECTORS = [
    {
        "path": "global-tectonic.json",
        "table": "tectonic_boundaries",
        "js_wrapper": False,
    },
    {
        "path": "global-faultlines.json",
        "table": "fault_lines",
        "js_wrapper": False,
    },
    {
        # Only shipped as a JS wrapper (no .json twin): file is
        # `window.EQ_DATA[...] = {GEOJSON};`. import_local_file needs a
        # bare GeoJSON file, so ingest.py extracts the object literal via
        # extract_geojson_from_js() before handing it to ogr2ogr.
        "path": "global-tectonic-points.js",
        "table": "tectonic_points",
        "js_wrapper": True,
    },
    # Admin boundaries (ESRI Shapefiles, WGS84 polygons). ogr2ogr reads the
    # .shp directly and PROMOTE_TO_MULTI stores them as MultiPolygon.
    {
        "path": "Admin_Boundaries/National_Boundary.shp",
        "table": "national_boundary",
        "js_wrapper": False,
    },
    {
        "path": "Admin_Boundaries/Provincial_Boundary.shp",
        "table": "provincial_boundary",
        "js_wrapper": False,
    },
    {
        "path": "Admin_Boundaries/District_Boundary.shp",
        "table": "district_boundary",
        "js_wrapper": False,
    },
    {
        "path": "Admin_Boundaries/Tehsil_Boundary.shp",
        "table": "tehsil_boundary",
        "js_wrapper": False,
    },
    # Pacific Ring of Fire belt (single WGS84 polygon). Rendered as an
    # outlined, low-opacity fill in the client.
    {
        "path": "Pacific Ring of Fire/Pacific_Ring_of_Fire.shp",
        "table": "pacific_ring_of_fire",
        "js_wrapper": False,
    },
    # NOAA NCEI global historical tsunami events (WGS84 points). Rendered as
    # clickable triangle markers with an event popup in the client.
    {
        "path": "historical_tsunamis_ncei/historical_tsunamis_ncei.shp",
        "table": "historical_tsunamis",
        "js_wrapper": False,
    },
    # Susceptible zones (WGS84 polygons). Rendered as an outlined, low-opacity
    # fill in the client.
    {
        "path": "Susceptable_Zones/Susceptable_Zones.shp",
        "table": "susceptible_zones",
        "js_wrapper": False,
    },
]

RASTERS = [
    {
        "path": "LS_hazard_map_final/LS Hazard Map.tif",
        "name": "ls_hazard_map",
        "title": "LS Hazard Map",
        "categorical": True,  # has a VAT (value attribute table): class codes, not a continuous field
    },
    {
        "path": "PGA_Hazard_Map/PGA_Hazard_World.tif",
        "name": "pga_hazard_world",
        "title": "PGA Hazard World",
        "categorical": True,
    },
    {
        # Continuous subduction slab depth (km); classed in the client via the
        # interval colormap from data/Slab_Depth/Key.png.
        "path": "Slab_Depth/Slab_Depth.tif",
        "name": "slab_depth",
        "title": "Slab Depth (km)",
        "categorical": False,
    },
]
