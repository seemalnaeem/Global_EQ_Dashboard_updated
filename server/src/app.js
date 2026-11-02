// Express app for the Global Earthquake Dashboard API. Route logic lives in
// src/routes + controllers + services; this file only wires the pipeline.
// Order matters: helmet, cors, morgan, json, rate limiter, routes, then the
// error handler (must stay last).
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import { apiRateLimit, tileRateLimit } from './middleware/rateLimit.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/error.js';

import healthRouter from './routes/health.js';
import quakesRouter from './routes/quakes.js';
import analyticsRouter from './routes/analytics.js';
import layersRouter from './routes/layers.js';
import rastersRouter from './routes/rasters.js';
import tilesRouter from './routes/tiles.js';
import hazardRouter from './routes/hazard.js';

const corsOrigins = (process.env.CORS_ORIGINS || '*').split(',').map((o) => o.trim());
const corsOptions = { origin: corsOrigins.includes('*') ? '*' : corsOrigins };

export const app = express();

app.use(helmet());
app.use(cors(corsOptions));
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(express.json());
app.use('/api', apiRateLimit);

app.use('/api/health', healthRouter);
app.use('/api/quakes', quakesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/layers', layersRouter);
app.use('/api/rasters', rastersRouter);
app.use('/api/tiles', tileRateLimit, tilesRouter);
// hazard.js mounts its own two routes directly under /api (hazard-layers,
// hazard-tiles) and applies tileRateLimit itself only to the tile proxy.
app.use('/api', hazardRouter);

app.use(notFound);
app.use(errorHandler);
