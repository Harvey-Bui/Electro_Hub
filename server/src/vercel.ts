import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import { createApp } from './app.js';
import { type AppConfig, loadConfig } from './config.js';
import { createKeys } from './db/keys.js';
import { describeError, getRedisClient, type RedisClient } from './db/redis.js';
import { seedDatabase } from './db/seed/index.js';
import { SCHEMA_VERSION } from './db/setup.js';
import { logger } from './lib/logger.js';
import { createRepositories } from './repositories/index.js';
import { createServices } from './services/index.js';

/**
 * Vercel serverless entry point (bundled by `scripts/vercel-build.ts`).
 *
 * Each warm function instance builds the Express app once and reuses one Redis
 * connection across requests. If Redis is unreachable, the request gets a 503
 * and the next request tries again.
 */
let appPromise: Promise<Express> | undefined;

/**
 * First start against an empty database: load the catalogue and demo customers.
 * `meta:schema-version` is written only after a successful seed, so a failed
 * seed is retried on the next cold start. The seed is idempotent, so two cold
 * starts racing is harmless.
 *
 * If ADMIN_PASSWORD is set in the Vercel project and that admin does not exist
 * yet, it is created (only the scrypt hash is stored). An existing admin is
 * never changed here; use `npm run admin:create` to rotate a password.
 *
 * `setupDatabase()` is not used here: managed Redis services block CONFIG GET.
 */
async function bootstrap(redis: RedisClient, config: AppConfig): Promise<void> {
  const keys = createKeys(config.redis.keyPrefix);
  const repos = createRepositories(redis, config);

  if (!(await redis.exists(keys.schemaVersion()))) {
    const summary = await seedDatabase(repos, { resetStock: false });
    await redis.set(keys.schemaVersion(), SCHEMA_VERSION, { condition: 'NX' });
    logger.info(
      `[vercel] first start: seeded ${summary.products.inserted.length} products, ` +
        `${summary.customers.inserted.length} customers`,
    );
  }

  const username = process.env.ADMIN_USERNAME?.trim() || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (password && !(await repos.admins.findByUsername(username))) {
    await createServices(repos, config).auth.createAdmin(username, password);
    logger.info(`[vercel] created administrator "${username.toLowerCase()}"`);
  }
}

async function init(): Promise<Express> {
  // Deployed code always runs in production mode: Secure cookies, COOKIE_SECRET required.
  process.env.NODE_ENV = 'production';
  const config = loadConfig();
  const redis = await getRedisClient(config.redis);
  await bootstrap(redis, config);
  return createApp({ config, redis });
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let app: Express;
  try {
    appPromise ??= init();
    app = await appPromise;
  } catch (error) {
    appPromise = undefined;
    logger.error(`[vercel] startup failed: ${describeError(error)}`);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'The database is unavailable. Try again.' },
      }),
    );
    return;
  }

  await new Promise<void>((resolve) => {
    res.on('finish', resolve);
    res.on('close', resolve);
    app(req, res);
  });
}
