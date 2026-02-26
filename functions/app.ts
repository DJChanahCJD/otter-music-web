import { corsMiddleware } from './middleware/cors';
import { authRoutes } from './routes/auth';
import { proxyRoutes } from './routes/proxy';
import { musicRoutes } from './routes/music';

import { Hono } from 'hono';
import type { Env } from './types/hono';

export const app = new Hono<{
  Bindings: Env;
}>().basePath('');

// Global Middleware
app.use('*', corsMiddleware);

// Routes
app.route('/auth', authRoutes);

app.route('/proxy', proxyRoutes);
app.route('/music-api', musicRoutes);

// Export AppType for RPC
export type AppType = typeof app;
