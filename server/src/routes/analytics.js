// GET /api/analytics/clusters
// Thin proxy to the geo service's clustering endpoint (GEO_SERVICE_URL).
// Query params are forwarded as-is. Response body and status code
// (including 501 when clustering is not implemented yet) pass through unchanged.
import { Router } from 'express';
import { getClusters } from '../controllers/analyticsController.js';

const router = Router();

router.get('/clusters', getClusters);

export default router;
