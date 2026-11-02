// GET /api/rasters
// Thin proxy to the geo service's raster catalog: GET {GEO_SERVICE_URL}/raster/catalog.
// Forwards the JSON body and status code unchanged. If the geo service is
// unreachable, responds 502 with a clear message (see services/geoService.js).
// Response shape: { rasters: [...] } as returned by the geo service.
import { Router } from 'express';
import { getRasters } from '../controllers/rastersController.js';

const router = Router();

router.get('/', getRasters);

export default router;
