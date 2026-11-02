# Base image ships GDAL, ogr2ogr/gdalinfo CLIs, PROJ, and GDAL's own
# Python bindings (osgeo.gdal, osgeo.ogr, osgeo.osr) already built against
# the same GDAL, avoiding the version-mismatch problems pip-built GDAL
# bindings cause (see rules/geospatial.md: geospatial libs break across versions).
# Pinned to a release on Python 3.12, where shapely/pyproj/fiona/geopandas
# ship binary wheels. The rolling "latest" tag moved to Python 3.14, which has
# no wheels yet and forced slow, compiler-dependent source builds.
FROM ghcr.io/osgeo/gdal:ubuntu-small-3.9.3

# pip is not preinstalled. build-essential plus the GEOS/PROJ dev headers are a
# safety net so any future geospatial dep can compile from source if a wheel is
# missing. GDAL dev headers are intentionally omitted to keep the image's GDAL
# the single source of truth.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3-pip python3-dev build-essential libgeos-dev libproj-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps before copying app code, so dependency layers cache
# separately from application code changes.
COPY requirements.txt .
RUN pip install -r requirements.txt --break-system-packages

COPY app ./app
COPY scripts ./scripts

EXPOSE 3091

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3091"]
