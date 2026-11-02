// GET /api/health
// Response: { status: "ok"|"degraded", db: "up"|"down", geo: "up"|"down" }
// Checks the db pool with SELECT 1 and pings GEO_SERVICE_URL/health,
// tolerating a geo failure so the API's own health is not hostage to it.
import { Router } from 'express';
import { getHealth } from '../controllers/healthController.js';

const router = Router();

router.get('/', getHealth);

export default router;
