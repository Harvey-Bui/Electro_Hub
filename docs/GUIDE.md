# ElectroHub Team Handbook

Everything you need to **run, use, inspect and work on** ElectroHub, in one place.
For _how the code is designed_ see [ARCHITECTURE.md](ARCHITECTURE.md); for every endpoint's
exact request/response see [API.md](API.md).

Commands below are for **Windows Command Prompt**. In PowerShell use `npm.cmd` the same way
and `cd "$env:USERPROFILE\..."` instead of `cd /d "%USERPROFILE%\..."`.

---

## 1. The project in 30 seconds

ElectroHub is an electronics web shop. **Redis is the real database** (not a cache): products,
carts, stock and orders all live in Redis, saved to disk.

```
 Browser  ──►  Website (React + Vite)  ──/api──►  API (Node + Express)  ──►  Redis (in Docker)
              http://localhost:5173              http://localhost:4000       localhost:6379
              client/                            server/                     docker-compose.yml
```

| Piece    | Folder    | Tech                                                                   | Job                                      |
| -------- | --------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| Frontend | `client/` | React 19, Vite 8, TypeScript, Tailwind 4, TanStack Query, React Router | Pages the shopper/admin sees             |
| Backend  | `server/` | Node, Express 5, TypeScript, Zod                                       | Rules, validation, login, talks to Redis |
| Database | Docker    | Redis 7.4 (AOF + RDB persistence)                                      | Stores everything                        |

Three programs run at once. Redis runs in the background in Docker; the API and the website each
keep a terminal busy, which is why you need **two terminals** (or `start.cmd`, which opens them).

---

## 2. First-time setup (new computer / new teammate)

Install: **Git**, **Node.js 22.12+** (LTS), **Docker Desktop**. Optional: **VS Code**, **Redis Insight**.

```bat
git clone https://github.com/Harvey-Bui/ElectroHub.git
cd ElectroHub
copy .env.example .env
```

Open `.env` in Notepad and fill in:

| Variable         | What to put                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `COOKIE_SECRET`  | A long random string. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_PASSWORD` | Any password, 12+ characters                                                                               |

Then, with Docker Desktop open (“Engine running”):

```bat
docker compose up -d redis
npm.cmd --prefix server ci
npm.cmd --prefix client ci
npm.cmd --prefix server run db:setup
npm.cmd --prefix server run db:seed
npm.cmd --prefix server run admin:create
```

- `db:setup` checks Redis and records the data-model version.
- `db:seed` loads **21 products** (7 categories) and 3 demo customers. Safe to re-run.
- `admin:create` creates the admin account from `ADMIN_USERNAME`/`ADMIN_PASSWORD` in `.env`.

**Never commit `.env`.** It is gitignored; share passwords privately.

---

## 3. Daily start and stop

**Easiest:** open Docker Desktop, then double-click **`start.cmd`**.

**Manually (two terminals):**

| Terminal 1                                                     | Terminal 2                               |
| -------------------------------------------------------------- | ---------------------------------------- |
| `cd /d "%USERPROFILE%\OneDrive\Desktop\ElectroHub\electrohub"` | same `cd`                                |
| `docker compose up -d redis`                                   |                                          |
| `npm.cmd --prefix server run dev`                              | `npm.cmd --prefix client run dev`        |
| wait for `ElectroHub API listening on http://localhost:4000`   | wait for `Local: http://localhost:5173/` |

**Stop:** `Ctrl + C` in each terminal (or close them). Redis can keep running; to stop it:
`docker compose stop redis`. Your data is kept either way.

Both servers **auto-reload** when you save a file.

---

## 4. Addresses

| URL                              | What                                               |
| -------------------------------- | -------------------------------------------------- |
| http://localhost:5173            | Store                                              |
| http://localhost:5173/admin      | Admin console (user `admin`, password from `.env`) |
| http://localhost:5173/design     | Design-system showcase (dev only)                  |
| http://localhost:4000/api/health | API + Redis health check                           |
| `localhost:6379`                 | Redis (for Redis Insight / redis-cli)              |

---

## 5. Using the app

**Shopper:** browse/search/filter products → add to cart → `/checkout` (name, email, address)
→ order is placed → see it in `/orders` → cancel it while it is still `pending` or `paid`.
No sign-up: the cart and orders are tied to a browser cookie (`eh_customer`).

**Admin** (`/admin`):

| Page      | Does                                                  |
| --------- | ----------------------------------------------------- |
| Dashboard | Revenue, order counts, best sellers, low-stock alerts |
| Orders    | List/filter orders, open one, change its status       |
| Products  | Create, edit, delete products                         |
| Inventory | See low / out-of-stock items, restock                 |

Order status rules:

```
pending → paid | cancelled
paid    → shipped | cancelled
shipped → delivered
delivered, cancelled → final
```

Cancelling **puts the stock back** and reverses revenue, all in one atomic step.

Seed edge cases on purpose: `msi-katana-15-b13v` has **0** stock, `lenovo-thinkpad-x1-carbon-gen12`
has **exactly 1**, handy for demoing “out of stock” and “not enough stock”.

---

## 6. The API (cheat sheet)

All routes start with `/api`. Responses are JSON: success `{ "data": ... }`, error
`{ "error": { "code", "message", "details"? } }`. Prices are **integers in cents** (`19999` = $199.99).

| Area              | Endpoints                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue         | `GET /categories` · `GET /products` (filters: `q`, category, brand, price, sort, page) · `GET /products/featured` · `GET /products/category/:category` · `GET /products/:id` |
| Cart              | `GET /cart` · `POST /cart/items` · `PUT /cart/items/:productId` · `DELETE /cart/items/:productId` · `DELETE /cart`                                                           |
| Checkout & orders | `POST /checkout` · `GET /orders` · `GET /orders/:id` · `POST /orders/:id/cancel`                                                                                             |
| Admin auth        | `POST /admin/login` · `POST /admin/logout` · `GET /admin/me`                                                                                                                 |
| Admin products    | `POST /admin/products` · `PUT /admin/products/:id` · `DELETE /admin/products/:id`                                                                                            |
| Admin orders      | `GET /admin/orders` · `GET /admin/orders/:id` · `PUT /admin/orders/:id/status`                                                                                               |
| Admin stock/stats | `GET /admin/inventory/low-stock` · `GET /admin/dashboard`                                                                                                                    |
| Health            | `GET /health`                                                                                                                                                                |

Common error codes: `VALIDATION_ERROR` (400), `PRODUCT_NOT_FOUND` / `ORDER_NOT_FOUND` (404),
`OUT_OF_STOCK` / `INSUFFICIENT_STOCK` / `INVALID_STATUS_TRANSITION` / `ORDER_NOT_CANCELLABLE` (409),
`EMPTY_CART` (400), `UNAUTHORIZED` / `INVALID_CREDENTIALS` (401), `TOO_MANY_REQUESTS` (429: 5 failed
admin logins per 15 min).

Try it in a browser: http://localhost:4000/api/products. Full details and curl examples:
[API.md](API.md).

**Security in one line:** admin passwords are hashed (scrypt), sessions live in Redis with an
expiry, cookies are signed and HttpOnly, every request body is validated with Zod, and
`helmet`/CORS are on.

---

## 7. Backend (`server/`)

A request passes through these layers, each in its own folder under `server/src/`:

```
routes/  →  middleware/  →  controllers/  →  services/  →  repositories/  →  Redis
(URL map)   (cookies,       (read request,   (business     (only place that
            admin auth,      send response)   rules: stock,  talks to Redis)
            errors)                           prices, status)
```

| Folder                     | Contains                                                                        |
| -------------------------- | ------------------------------------------------------------------------------- |
| `config.ts`                | Reads and validates `.env`                                                      |
| `db/`                      | Redis connection, key names (`keys.ts`), Lua scripts (`scripts.ts`), seed data  |
| `schemas/api.ts`           | Zod rules for every request body/query                                          |
| `lib/`                     | Password hashing, cookies, `HttpError`                                          |
| `scripts/` (outside `src`) | `db:setup`, `db:seed`, `db:reset`, `admin:create`                               |
| `tests/`                   | 119 tests (Vitest + Supertest) against a real Redis with a separate test prefix |

**Adding a feature** usually means: schema → repository function → service → controller →
route → test. See ARCHITECTURE.md §10.

---

## 8. Frontend (`client/`)

| Route                                                                                                                               | Page                                     |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `/`                                                                                                                                 | Home                                     |
| `/products`, `/products/:id`                                                                                                        | Catalogue, product detail                |
| `/checkout`                                                                                                                         | Checkout form                            |
| `/orders`, `/orders/:id`                                                                                                            | Order history, order detail              |
| `/admin/login`, `/admin`, `/admin/orders`, `/admin/products`, `/admin/products/new`, `/admin/products/:id/edit`, `/admin/inventory` | Admin console (loaded only when visited) |
| `/design`                                                                                                                           | Component showcase (dev only)            |

| Folder (`client/src/`)                   | Contains                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `api/`                                   | Functions that call the API + TanStack Query hooks (caching, refetching) |
| `components/ui`                          | Buttons, inputs, modal, drawer, badges… (the design system)              |
| `components/commerce`, `layout`, `admin` | Product cards, cart drawer, header/footer, admin tables                  |
| `pages/`                                 | One file per route                                                       |
| `styles/`                                | `tokens.css` (colours, spacing, fonts), `theme.css` (Tailwind mapping)   |
| `lib/`                                   | Formatting money/dates, validation, helpers                              |

Design: dark-first, electric-blue accent, Inter + JetBrains Mono. Use the tokens, not raw colours.
In dev, Vite forwards `/api/*` to `localhost:4000`, so the browser only talks to port 5173.

---

## 9. Docker

Docker only runs **Redis**; the API and website run directly with Node.

| Command                                      | Does                                           |
| -------------------------------------------- | ---------------------------------------------- |
| `docker compose up -d redis`                 | Start Redis in the background                  |
| `docker compose ps`                          | Is it running / healthy?                       |
| `docker compose logs redis`                  | Redis logs                                     |
| `docker compose stop redis`                  | Stop (data kept)                               |
| `docker compose down`                        | Remove the container (data kept in the volume) |
| `docker compose down -v`                     | ⚠️ Remove container **and delete all data**    |
| `docker exec -it electrohub-redis redis-cli` | Open a Redis command line                      |

Data is saved in the Docker volume `electrohub_redis-data` (append-only file every second, plus
snapshots), so it survives restarts and reboots.

---

## 10. Looking inside Redis

**Redis Insight:** Add database → `localhost:6379`, no username/password → Test connection → Add.
Switch the key list to **Tree view** and filter with `electrohub:*`.

**redis-cli:** `docker exec -it electrohub-redis redis-cli`

Every key starts with `electrohub:`. The important ones:

| Key                                                                      | Type             | Holds                                                  |
| ------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------ |
| `product:{id}`                                                           | Hash             | One product (name, brand, price in cents, specs JSON…) |
| `products`                                                               | Set              | All product IDs                                        |
| `products:category:{slug}`, `products:brand:{slug}`, `products:featured` | Set              | Indexes for filtering                                  |
| `products:by-price`, `products:by-created`, `products:by-sales`          | Sorted set       | Indexes for sorting / best sellers                     |
| `inventory`                                                              | Hash             | Stock per product                                      |
| `inventory:low-stock` / `inventory:out-of-stock`                         | Sorted set / Set | Alert lists (low-stock scored by units left)           |
| `cart:{customerId}`                                                      | Hash             | productId → quantity (expires after 30 idle days)      |
| `customer:{id}`, `customer:email:{email}`                                | Hash / String    | Customer and email lookup                              |
| `order:{id}`                                                             | Hash             | One order (`ord_000001`…)                              |
| `orders`, `orders:customer:{id}`, `orders:status:{status}`               | Sorted set       | Order lists by date                                    |
| `counter:order`, `counter:customer`                                      | String           | ID counters                                            |
| `stats:revenue-cents`                                                    | String           | Total revenue                                          |
| `session:admin:{hash}`                                                   | Hash (TTL)       | Admin login session                                    |

Useful read-only commands:

```
KEYS electrohub:product:*          (fine for our small dataset)
HGETALL electrohub:product:shure-sm7b
HGETALL electrohub:inventory
ZRANGE electrohub:products:by-price 0 -1 WITHSCORES
SMEMBERS electrohub:products:category:mice
TTL electrohub:cart:<customerId>
```

**Rules:** look, don't edit. Indexes are kept in sync by the app (Lua scripts and transactions),
so editing a value by hand breaks them. Use the admin console to change data.
**Never run `FLUSHALL` or `FLUSHDB`.** To start fresh on purpose:
`npm.cmd --prefix server run db:reset -- --yes` then `db:seed`.

---

## 11. Configuration (`.env`)

One `.env` in the repo root is read by the server, the client and Docker. Keys you may touch:

| Variable                                                | Default                        | Meaning                             |
| ------------------------------------------------------- | ------------------------------ | ----------------------------------- |
| `PORT`                                                  | 4000                           | API port                            |
| `CORS_ORIGIN`                                           | http://localhost:5173          | Allowed website origin              |
| `COOKIE_SECRET`                                         | (required)                     | Signs cookies                       |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD`                     | admin / (set it)               | Used by `admin:create`              |
| `ADMIN_SESSION_TTL_HOURS`                               | 8                              | Admin auto-logout                   |
| `REDIS_URL` / `REDIS_PASSWORD`                          | redis://localhost:6379 / empty | Database connection                 |
| `LOW_STOCK_THRESHOLD`                                   | 5                              | “Low stock” level                   |
| `CART_TTL_DAYS`                                         | 30                             | Idle cart expiry                    |
| `FREE_SHIPPING_THRESHOLD_CENTS` / `SHIPPING_FLAT_CENTS` | 10000 / 999                    | Free shipping over $100, else $9.99 |

Do **not** add `NODE_ENV` to `.env` (it breaks the production website build). Restart the API
after changing `.env`.

---

## 12. Command cheat sheet

Run from the repo root.

| Command                                                               | Does                                                             |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `npm.cmd --prefix server run dev` / `npm.cmd --prefix client run dev` | Start API / website                                              |
| `npm.cmd test`                                                        | All tests (server 119 + client 34). Redis must be running        |
| `npm.cmd run lint`                                                    | Code-style checks                                                |
| `npm.cmd run typecheck`                                               | TypeScript checks                                                |
| `npm.cmd run format`                                                  | Auto-format with Prettier                                        |
| `npm.cmd run build`                                                   | Production build of both                                         |
| `npm.cmd --prefix server run db:seed`                                 | Load / refresh demo products (`-- --reset-stock` to reset stock) |
| `npm.cmd --prefix server run db:reset -- --yes`                       | Delete all ElectroHub data                                       |
| `npm.cmd --prefix server run admin:create`                            | Create/update the admin from `.env`                              |

**Before you push:** `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`.

---

## 13. Git workflow for the team

```bat
git pull                       :: get teammates' work first
:: ...make changes...
git status                     :: see what changed
git add .                      :: stage (.env is ignored automatically)
git commit -m "feat: add wishlist button"
git push
```

- Message prefixes: `feat:` new feature, `fix:` bug fix, `docs:` docs, `chore:` tooling,
  `test:` tests.
- Push rejected? Someone pushed first: `git pull`, then `git push`.
- Teammates must be added on GitHub under **Settings → Collaborators**.
- Avoid `git push --force` once others are pushing to the repo.
- VS Code alternative: Source Control icon → `+` to stage → message → Commit → Sync.

---

## 14. Troubleshooting

| Symptom                                 | Fix                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `no configuration file provided`        | You are not in the project folder. `cd` into `electrohub` first              |
| `npm.ps1 cannot be loaded` (PowerShell) | Use `npm.cmd` instead of `npm`                                               |
| `cd` does nothing in Command Prompt     | Use `cd /d "..."`                                                            |
| `docker` not found / Redis won't start  | Open Docker Desktop, wait for “Engine running”                               |
| API says it can't reach Redis           | `docker compose up -d redis`, then restart the API                           |
| Can't reach `localhost:5173`            | A terminal was closed. Run `start.cmd` again                                 |
| Products page is empty                  | Run `npm.cmd --prefix server run db:seed`                                    |
| Admin login fails                       | Check `ADMIN_PASSWORD` in `.env`, run `admin:create` again                   |
| “Too many attempts” on admin login      | Wait 15 minutes (rate limit)                                                 |
| Port already in use                     | An old server is still running. Close its window, or restart the computer    |
| Redis Insight can't connect             | Same as above: Docker Desktop + `electrohub-redis` container must be running |

---

## 15. Things to never do

- Commit or share `.env` publicly (passwords, cookie secret).
- Run `FLUSHALL`, `FLUSHDB` or `docker compose down -v` unless you mean to wipe all data.
- Hand-edit Redis keys (breaks indexes and stock).
- Store prices as decimals (always integer cents).
- Add another database (MongoDB, SQL, JSON files). Redis is the database by design.
