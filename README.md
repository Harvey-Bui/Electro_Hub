# ElectroHub

**NoSQL-powered electronics e-commerce platform.** Redis is ElectroHub's primary database,
not a cache: products, shopping carts, inventory and orders are stored in Redis 7 with
persistence (AOF and RDB) turned on.

| Layer    | Technology                                                 |
| -------- | ---------------------------------------------------------- |
| Frontend | React 19, Vite 8, TypeScript, Tailwind CSS 4, React Router |
| Backend  | Node.js, Express 5, TypeScript, Zod                        |
| Database | Redis 7 Community Edition (official `redis` Node client)   |
| Testing  | Vitest, Supertest, Testing Library                         |
| Tooling  | ESLint (flat config), Prettier, Docker Compose             |

> Status: **feature complete for v1.** A shopper can browse, search, check out, and view
> or cancel their orders. An admin can sign in at `/admin` to manage orders, products and
> stock. Everything runs on the Redis-backed REST API.
>
> **New to the project? Start with [docs/GUIDE.md](docs/GUIDE.md)** (run, use, inspect, troubleshoot),
> then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the
> frontend, backend and database fit together, with diagrams of the main flows. The
> endpoint reference is [docs/API.md](docs/API.md).

---

## Prerequisites

- **Node.js 22.12 or newer** (see `.nvmrc`; developed on Node 24)
- **npm 10 or newer**
- **Docker Desktop** (or any Docker Engine with Compose v2), used to run Redis

## Quick start

```bash
# 1. Configure the environment (one shared .env at the repo root)
cp .env.example .env

# 2. Start Redis 7
docker compose up -d redis

# 3. Install dependencies (the server and client are independent packages)
npm --prefix server install
npm --prefix client install

# 4. Check Redis persistence and load the catalogue (safe to re-run)
npm --prefix server run db:setup
npm --prefix server run db:seed

# 5. Create the admin account. Set ADMIN_PASSWORD (12+ characters) in .env first.
npm --prefix server run admin:create

# 6. Run the API: http://localhost:4000/api/health
npm --prefix server run dev

# 7. In a second terminal, run the web app: http://localhost:5173
npm --prefix client run dev
```

The root `package.json` only has shortcuts for these commands (`npm run db:up`,
`npm run dev:server`, `npm run dev:client`, `npm test`, …). It has no dependencies of its own.

## Project structure

```
electrohub/
├── docker-compose.yml        Redis 7 with persistence (AOF everysec + RDB) and a healthcheck
├── .env.example              All environment variables (server, client, compose)
├── docs/GUIDE.md             Team handbook: setup, daily use, Docker, Redis Insight, Git, fixes
├── docs/ARCHITECTURE.md      How everything fits together: database, API, frontend, flows
├── docs/API.md               REST API reference (every endpoint, body, response, error)
├── start.cmd                 Windows one-click launcher (Redis + API + website)
├── server/                   Express API (independent npm package)
│   ├── src/
│   │   ├── config.ts         Loads and validates env vars with Zod (fails fast)
│   │   ├── index.ts          Entry point: connects to Redis, starts HTTP, shuts down cleanly
│   │   ├── app.ts            buildApp(): wires repositories → services → routes
│   │   ├── db/
│   │   │   ├── redis.ts      Shared client, fail-fast connect, reconnect policy, graceful close
│   │   │   ├── keys.ts       Single source of truth for the Redis key schema
│   │   │   ├── scripts.ts    Lua scripts for atomic record + index updates
│   │   │   ├── setup.ts      Persistence checks, schema version, reset
│   │   │   └── seed/         Catalogue (21 products) and demo customers, idempotent
│   │   ├── repositories/     products, inventory, customers, carts, orders, admins, rate limits
│   │   ├── services/         catalog, cart, orders (checkout), auth, dashboard: business rules
│   │   ├── controllers/      HTTP handlers: validate input, call one service, shape the response
│   │   ├── routes/           Routers: catalog, shop (cart/checkout/orders), admin, health
│   │   ├── middleware/       customer cookie, admin auth, error handler
│   │   ├── schemas/          Zod domain schemas + HTTP input schemas (api.ts)
│   │   └── lib/              crypto (scrypt, tokens), cookies, HttpError, logger
│   ├── scripts/              db:setup, db:seed, db:reset, admin:create CLIs
│   └── tests/                Vitest + Supertest (unit and real-Redis integration)
└── client/                   React SPA (independent npm package)
    ├── vite.config.ts        Dev proxy /api → server, Vitest config
    ├── tailwind.config.ts    Content globs only (design values live in tokens.css)
    └── src/
        ├── styles/
        │   ├── tokens.css    Design tokens: colours (dark + light), type, 4px spacing, radii, shadows, motion, breakpoints
        │   ├── theme.css     Maps tokens onto Tailwind utilities (bg-surface, text-fg-muted, …)
        │   └── index.css     Base styles, focus ring, dialog/skeleton animations
        ├── api/              Typed fetch wrapper, endpoint functions, TanStack Query hooks
        ├── components/       ui/ (primitives) · commerce/ · layout/. See components/README.md
        ├── hooks/            useAddToCartWithFeedback
        ├── pages/            Home, Products, Product, NotFound, Design (dev only)
        ├── store/            Theme and cart-drawer state (React context)
        └── lib/              cn(), price/spec formatting
```

### Frontend design system

- **Look:** dark first, with an optional light theme (toggle in the navbar, remembered per
  browser) and an electric-blue accent.
- **Fonts:** Inter for interface text and JetBrains Mono for prices and specifications.
  Both are self-hosted through `@fontsource`, so there are no third-party font requests.
- **Tokens:** every colour, size and timing is a token in
  [client/src/styles/tokens.css](client/src/styles/tokens.css). Tailwind's default palette
  is disabled, so components can only use semantic tokens.
- **Components:** documented in [client/src/components/README.md](client/src/components/README.md).
- **Showcase:** in development, open **http://localhost:5173/design** to see every token in
  both themes and every component with its variants, loading, disabled and validation
  states. The route is not included in production builds.
- **Storefront pages:**
  - Home, product listing and product detail.
  - Cart drawer.
  - **Checkout** (`/checkout`): validation, inline server errors, and stock conflicts
    handled.
  - **Order confirmation and history** (`/orders`, `/orders/:id`): a status tracker, and
    cancellation with a confirmation step.
- **Admin console** (`/admin`): sign in with the account from `npm run admin:create`.
  - **Dashboard:** live figures from Redis, orders by status, top sellers, recent orders,
    and low stock.
  - **Orders:** filter by status, and move orders along their allowed status changes.
  - **Products:** search, create, edit (typed specs editor, live preview) and delete.
  - **Inventory:** low-stock list with restocking on the page.
  - **Sessions:** an expired session sends you back to the login page and returns you
    afterwards.
  - The admin code loads separately, so shoppers never download it.

### Layering (server)

```
routes → middleware → controllers  →  services  →  repositories  →  Redis
(paths)  (cookies,     (HTTP in/out,    (business     (keys + commands,
          auth)         Zod input)       rules)         Lua, MULTI)
```

- **Controllers** parse and validate input with the Zod schemas in `schemas/api.ts`, call
  one service, and send `{ data }` or `{ data, pagination }`. They never touch Redis.
- **Services** hold the business rules and combine repositories. Checkout, for example, is
  `inventory.reserve()` → `orders.create()` → `inventory.release()` if anything fails.
- **Repositories** are the only code that builds Redis keys (through `db/keys.ts`) and sends
  commands. Get them all from `createRepositories(client, config)`.
- `createApp()` receives its dependencies as arguments, so tests can inject them.

## Redis database architecture

Redis is the **system of record**. There is no other database and no JSON files. Every key
starts with `REDIS_KEY_PREFIX` (default `electrohub:`), so `product:{id}` is stored as
`electrohub:product:{id}`. That keeps the app's data separate from test data
(`electrohub:test:…`) and from anything else in the same Redis.

### Keys

| Key                                  | Type       | Contents                                                                                       |
| ------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------- |
| `product:{id}`                       | Hash       | name, brand, category, description, priceCents, `specs` (JSON), imageUrl, featured, timestamps |
| `products`                           | Set        | every product id                                                                               |
| `products:category:{slug}`           | Set        | ids in a category (7 categories)                                                               |
| `products:brand:{brandSlug}`         | Set        | ids of a brand (`ASUS` → `asus`, `RØDE` → `rode`)                                              |
| `products:featured`                  | Set        | featured ids                                                                                   |
| `products:by-created`                | Sorted set | id → created-at ms (sort by newest)                                                            |
| `products:by-price`                  | Sorted set | id → price in cents (price sort and price ranges)                                              |
| `products:by-sales`                  | Sorted set | id → units sold (best-seller ranking)                                                          |
| `inventory`                          | Hash       | id → units in stock. **The only place stock is stored.**                                       |
| `inventory:low-stock`                | Sorted set | id → stock, for products at or below `LOW_STOCK_THRESHOLD`                                     |
| `inventory:out-of-stock`             | Set        | ids with zero stock                                                                            |
| `customer:{id}`                      | Hash       | email, name, phone, `address` (JSON), timestamps                                               |
| `customer:email:{email}`             | String     | email → customer id (unique lookup)                                                            |
| `customers`                          | Set        | every customer id                                                                              |
| `cart:{customerId}`                  | Hash       | productId → quantity, with a sliding TTL (`CART_TTL_DAYS`)                                     |
| `order:{id}`                         | Hash       | customer, status, totals, `items` and `shippingAddress` (JSON snapshot)                        |
| `orders`                             | Sorted set | id → placed-at ms                                                                              |
| `orders:customer:{customerId}`       | Sorted set | a customer's order history                                                                     |
| `orders:status:{status}`             | Set        | ids per status (pending, paid, shipped, delivered, cancelled)                                  |
| `counter:order` / `counter:customer` | String     | `INCR` sequences → `ord_000001`, `cus_000001`                                                  |
| `meta:schema-version`                | String     | data-model version written by `db:setup`                                                       |

### How consistency is kept

- **One step per write.** Creating, editing or deleting a product runs one Lua script
  ([server/src/db/scripts.ts](server/src/db/scripts.ts)). The script writes the hash and
  updates the category, brand, featured, price, created, sales and inventory indexes
  together. The edit script reads the _stored_ category and brand before moving the
  product, so concurrent edits can't leave a product in two categories.
- **Stock can't go negative.** `inventory.reserve()` checks every line, then decrements
  them all inside one script: either all lines are reserved or none are. The tests send 20
  simultaneous buyers at a product with 1 unit, and exactly one succeeds. The same script
  keeps `inventory:low-stock` and `inventory:out-of-stock` in sync.
- **Unique emails.** `SET customer:email:{email} NX` is how a sign-up claims an address.
- **Orders** are written with `MULTI`/`EXEC`: hash, time index, customer history, status
  set, the sales ranking and (optionally) clearing the cart. Status changes check the
  allowed transitions and move between `orders:status:*` sets atomically.
- **No keyspace scans in app code.** Listing reads the sort index directly (`ZRANGE … LIMIT`),
  or intersects the filter sets (`SINTER`) and sorts with `ZMSCORE`. Only the admin
  `db:reset` uses `SCAN`.

### Persistence

[docker-compose.yml](docker-compose.yml) runs `redis:7.4-alpine` with
`--appendonly yes --appendfsync everysec`, which loses at most about 1 s of writes on a
crash. RDB snapshots run as a second backup. The data lives in the named volume
`electrohub_redis-data`, so it survives `docker compose restart` and `down`/`up`.
`docker compose down -v` deletes it. `npm run db:setup` warns if AOF is off.

### Database scripts (run in `server/`)

| Command                            | What it does                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run db:setup`                 | PING, report AOF/RDB settings, write `meta:schema-version`                                                              |
| `npm run db:seed`                  | Upsert 21 products and 3 demo customers, then print a summary. Safe to re-run: no duplicates, and current stock is kept |
| `npm run db:seed -- --reset-stock` | Same, but also resets stock to the seed values                                                                          |
| `npm run db:reset -- --yes`        | Delete every key under the prefix (refuses when `NODE_ENV=production`)                                                  |

The seed contains products in two edge cases on purpose: `msi-katana-15-b13v` has
**0 units** and `lenovo-thinkpad-x1-carbon-gen12` has **exactly 1**.

### Exploring the data with redis-cli

```bash
docker exec -it electrohub-redis redis-cli
```

```text
PING                                                   # PONG
DBSIZE
HGETALL electrohub:product:asus-rog-strix-g16-2025     # product hash (specs is JSON)
SMEMBERS electrohub:products:category:gaming-laptops   # category index
SMEMBERS electrohub:products:brand:lenovo              # brand index
SINTER electrohub:products:category:laptops electrohub:products:brand:lenovo
SMEMBERS electrohub:products:featured
ZRANGE electrohub:products:by-price 0 4 WITHSCORES     # 5 cheapest
ZREVRANGE electrohub:products:by-created 0 2           # 3 newest
ZREVRANGE electrohub:products:by-sales 0 4 WITHSCORES  # best sellers
HGET electrohub:inventory lenovo-thinkpad-x1-carbon-gen12
ZRANGE electrohub:inventory:low-stock 0 -1 WITHSCORES  # lowest stock first
SMEMBERS electrohub:inventory:out-of-stock
GET electrohub:customer:email:alex.nguyen@example.com
HGETALL electrohub:customer:cus_000001
CONFIG GET appendonly                                  # yes
INFO persistence
```

On Windows Git Bash, prefix commands that pass container paths with `MSYS_NO_PATHCONV=1`,
for example `MSYS_NO_PATHCONV=1 docker exec electrohub-redis ls /data/appendonlydir`.

## Environment variables

Both packages and Docker Compose read the **repository-root `.env`** file. The server also
reads `server/.env` when that file exists. Only variables prefixed with `VITE_` are sent to
the browser.

| Variable                                                  | Default                                                   | Used by                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                | `development`                                             | server. Set by the host, **not in `.env`**: Vite reads `.env` too and would build a dev bundle |
| `PORT`                                                    | `4000`                                                    | server                                                                                         |
| `CORS_ORIGIN`                                             | `http://localhost:5173`                                   | server (comma-separated)                                                                       |
| `REDIS_URL`                                               | `redis://localhost:6379`                                  | server                                                                                         |
| `REDIS_PASSWORD`                                          | _(empty)_                                                 | server, compose                                                                                |
| `REDIS_KEY_PREFIX`                                        | `electrohub:`                                             | server                                                                                         |
| `REDIS_PORT`                                              | `6379`                                                    | compose (host port)                                                                            |
| `LOW_STOCK_THRESHOLD`                                     | `5`                                                       | server (low-stock index)                                                                       |
| `CART_TTL_DAYS`                                           | `30`                                                      | server (cart expiry)                                                                           |
| `FREE_SHIPPING_THRESHOLD_CENTS`                           | `10000`                                                   | server (checkout)                                                                              |
| `SHIPPING_FLAT_CENTS`                                     | `999`                                                     | server (checkout)                                                                              |
| `COOKIE_SECRET`                                           | dev-only fallback; **required in production** (32+ chars) | server (cookie signing)                                                                        |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD`                       | `admin` / _(empty)_                                       | `admin:create` script only                                                                     |
| `ADMIN_SESSION_TTL_HOURS`                                 | `8`                                                       | server                                                                                         |
| `ADMIN_LOGIN_MAX_ATTEMPTS` / `ADMIN_LOGIN_WINDOW_MINUTES` | `5` / `15`                                                | server (login lockout)                                                                         |
| `TRUST_PROXY`                                             | `false`                                                   | server (behind a reverse proxy)                                                                |
| `VITE_API_BASE_URL`                                       | _(empty = same origin)_                                   | client                                                                                         |
| `VITE_DEV_API_PROXY_TARGET`                               | `http://localhost:4000`                                   | client dev server                                                                              |

## Scripts

Both `server/` and `client/` have these scripts:

| Script                            | Description                                  |
| --------------------------------- | -------------------------------------------- |
| `npm run dev`                     | Dev server with reload on change             |
| `npm run build`                   | Production build (`dist/`)                   |
| `npm start` / `npm run preview`   | Run the build (server) / preview it (client) |
| `npm run typecheck`               | `tsc` without emitting files                 |
| `npm run lint` / `lint:fix`       | ESLint                                       |
| `npm run format` / `format:check` | Prettier                                     |
| `npm test` / `test:watch`         | Vitest                                       |

### Tests

- `server/tests/app.test.ts`: HTTP behaviour without Redis (health, 404 format, bad JSON,
  413, CORS, security headers).
- `server/tests/api/*.test.ts`: every endpoint through Supertest on the real app and a real
  Redis. Covers products and category filtering, sorting and validation; cart operations
  and stock checks; checkout, including last-unit races and all-or-nothing reservation;
  order cancellation and restocking; admin authentication (cookie flags, lockout, logout,
  protected routes); and admin product, order, inventory and dashboard endpoints.
- `server/tests/repositories/*.test.ts` and `server/tests/seed.test.ts` run against a
  **real Redis**, under an isolated key prefix (`electrohub:test:{suite}:{pid}:`) that is
  deleted afterwards, so they never touch seeded data. They cover index maintenance,
  concurrent edits, last-unit races, email uniqueness, order transitions and seed
  idempotency. They're skipped when Redis is unreachable; set `REQUIRE_REDIS=1` (for
  example in CI) to make that a failure instead.
- `client/src/**/*.test.ts(x)`: API client and component tests (jsdom).

## Team workflow (3 members)

- `main` is always releasable. Create feature branches such as `feat/products-api`,
  `feat/cart`, `feat/orders-checkout`, and open a pull request for review.
- Before you push, run `npm run lint && npm run typecheck && npm test` from the repo root.
- Suggested split: (1) catalogue and inventory, (2) cart and checkout/orders, (3) frontend
  pages and state. Coordinate any change to `server/src/db/keys.ts`, because every feature
  depends on it.

## Troubleshooting

**"An Application Control policy has blocked this file" / "Cannot find native binding" (Windows)**
Windows Smart App Control blocks native `.node` binaries that have no reputation yet. It
blocked the `rolldown` binary used by Vite 8 and Vitest 5 version 1.2.18 on the machine
this project was set up on. To work around it, both `package.json` files pin
`vite@8.3.6` and `rolldown@1.2.16` through `overrides`. That combination is supported
upstream, and its binary loads on that machine. Once newer binaries load on every team
member's machine, you can remove the `overrides` blocks (and the exact `vite` pin in
`client/package.json`), then reinstall.

**Server exits with "Unable to connect to Redis"**
The API connects to Redis when it starts and exits on failure, after about 5 retries.
Start Redis with `docker compose up -d redis` and check that it is healthy with
`docker compose ps`.
