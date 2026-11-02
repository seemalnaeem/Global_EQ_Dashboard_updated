---
name: raster-tiles
description: Convert rasters to COG and serve them as dynamic tiles via TiTiler with client-side color ramps. Use for hazard-map overlays.
---

# Raster Tiles (COG + TiTiler)

## Pipeline
Raw GeoTIFF -> COG (once, in geo) -> TiTiler serves XYZ tiles -> Mapbox raster
source on the client. Symbolization is a client concern, applied per tile request.

## COG conversion (geo, idempotent)
```python
from osgeo import gdal
gdal.Translate(out_cog, src, format="COG",
    creationOptions=["COMPRESS=DEFLATE", "OVERVIEW_RESAMPLING=NEAREST",
                     "BLOCKSIZE=512"])
```
Skip if `out_cog` already exists. The COG driver builds the pyramids. Read per-band
min/max (gdal ComputeStatistics) so the client gets a sensible default rescale.
Keep the COG path identical in geo and titiler so `url=` resolves in both.

## Serving (TiTiler, via the /tiles proxy)
Tile template (client fills z/x/y and styling):
```
/tiles/cog/tiles/{z}/{x}/{y}.png?url=/data/cogs/NAME.tif
    &colormap_name=viridis&rescale=MIN,MAX
```
TileJSON and stats for discovery:
```
/tiles/cog/WebMercatorQuad/tilejson.json?url=/data/cogs/NAME.tif
/tiles/cog/statistics?url=/data/cogs/NAME.tif
```

## Client color ramps
Pick any TiTiler `colormap_name` (viridis, magma, turbo, ...) or pass a custom
`colormap` JSON. Change `rescale=min,max` to stretch. Rebuild the raster source
tiles URL on change; do not re-fetch the COG.

## Categorical rasters (LS and PGA hazard have a VAT)
Values are class codes. Use a discrete `colormap` mapping code to color rather
than a continuous ramp, or rescale across the class range.
