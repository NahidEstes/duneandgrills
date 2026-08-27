# Dune & Grills — Full-Stack Restaurant Website

A modern, dark-mode restaurant ordering site for **Dune & Grills**, built with
MongoDB and Express on the backend and Next.js App Router with Tailwind CSS on
the frontend.

Domain: `duneandgrills.com`

```
duneandgrills/
├── backend/     Express + MongoDB REST API
└── frontend/    Next.js App Router + Tailwind CSS
```

## Design

- **Background:** pure black (`#000000`)
- **Accent:** amber (`#D97706` / `#F59E0B`)
- **Type:** Bebas Neue (display headlines) + Inter (body)
- **Signature element:** a recurring "dune horizon" wave divider in amber
  gradient, used between sections to tie the sand (Dune) and fire (Grills)
  halves of the brand together.

No menu data is hardcoded in the UI. The frontend fetches everything from the
Express API (`GET /api/menu`), and the API reads from MongoDB — so updating a
price, swapping an image, or adding a new dish only ever requires a database
change.

---

## 1. Prerequisites

- Node.js 20.9+ and npm
- A MongoDB instance — either:
  - Local MongoDB (`mongodb://127.0.0.1:27017`), or
  - A free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster

---

## 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:

```
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/duneandgrills
CLIENT_ORIGIN=http://localhost:3000
```

Seed the database with the starting menu (Burger, Sandwich, Shawarma, Mocha,
Orange Juice, Shrimp Dynamite):

```bash
npm run seed
```

Populate the homepage with scheduled promotional offers:

```bash
npm run seed:offers
```

The offer seed uses dates relative to the time it is run, so its countdowns
remain active. It replaces only the offers collection and does not modify menu,
blog, user, or order data.

Populate the account dashboard with two demo customers, linked orders,
favorites, addresses, demo payment descriptors, reward points, and reviews:

```bash
npm run seed:profiles
```

The profile seed is idempotent and does not clear the menu, blog, real users,
or real orders. Demo logins:

- `nahid@duneandgrills.com` / `Demo@12345`
- `sara@duneandgrills.com` / `Demo@12345`

Payment-method seed data contains only a brand, fictional last four digits,
expiry, and cardholder name. It never contains full card numbers or CVVs.

Start the API:

```bash
npm run dev      # with nodemon, auto-restarts on changes
# or
npm start
```

The API runs at `http://localhost:5000`.

### API Endpoints

| Method | Route                     | Description                          |
|--------|---------------------------|---------------------------------------|
| GET    | `/api/health`             | Health check                          |
| GET    | `/api/menu`                | List all menu items (`?category=Food`) |
| GET    | `/api/menu/:id`            | Get a single menu item                |
| POST   | `/api/menu`                 | Create a menu item                    |
| PUT    | `/api/menu/:id`             | Update a menu item                    |
| DELETE | `/api/menu/:id`             | Delete a menu item                    |
| GET    | `/api/offers`                | List active, currently valid offers   |
| GET    | `/api/offers/:id`            | Get one active, currently valid offer |
| GET    | `/api/offers/manage`         | List all offers (admin/manager)       |
| POST   | `/api/offers`                | Create an offer (admin/manager)        |
| PUT    | `/api/offers/:id`            | Update an offer (admin/manager)        |
| DELETE | `/api/offers/:id`            | Delete an offer (admin/manager)        |
| GET    | `/api/orders`               | List all orders                       |
| POST   | `/api/orders`               | Create a new order                    |
| GET    | `/api/orders/:id`           | Get a single order                    |
| PATCH  | `/api/orders/:id/status`    | Update order status                   |

> The create/update/delete menu routes and the orders list route are left
> open here for simplicity — add an auth middleware (JWT/session) before
> deploying to production.

---

## 3. Frontend Setup

```bash
cd frontend
npm install
```

Create a `.env.local` file if your API isn't on `localhost:5000`:

```
BACKEND_API_URL=http://localhost:5000/api
```

Run the dev server:

```bash
npm run dev
```

Visit `http://localhost:3000`.

Build for production:

```bash
npm run build   # creates the optimized Next.js production build
npm start       # serves the production build locally
```

---

## 4. Project Structure

```
backend/
├── controllers/       Route handler logic
├── data/               Seed script + seed data
├── models/              Mongoose schemas (MenuItem, Order)
├── routes/               Express routers
└── server.js              App entry point

frontend/
├── app/                    App Router pages, layouts, metadata and SEO routes
├── src/
│   ├── api/                Browser and server API clients
│   ├── components/         Shared UI and interactive page components
│   └── context/            Auth and cart providers
├── public/                 Brand assets
└── tailwind.config.js
```

## 5. Updating the Menu

Because nothing is hardcoded in the UI, you can update the menu in one of two
ways:

1. **Re-run the seed script** after editing `backend/data/seedData.js`, or
2. **Use the API directly** (e.g. via Postman or an admin panel you build
   later):

```bash
curl -X POST http://localhost:5000/api/menu \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Spiced Lamb Kebab",
    "description": "Char-grilled lamb skewers with harissa yogurt.",
    "price": 10.5,
    "category": "Food",
    "image": "https://images.unsplash.com/photo-...",
    "tags": ["spicy"]
  }'
```

The frontend will pick up the change on the next page load — no code
changes required.

## 6. Managing Offers

Sign in with an admin or manager account, open `/admin`, and choose **Offers**.
The form supports the offer copy, image URL, promotional code, prices, CTA,
display order, featured status, active status, start time, and expiry time.

Only active offers whose start time has passed and whose expiry time is still
in the future are returned by the public API. The homepage countdown is derived
from each offer's database `expiresAt` value and removes the offer when it
expires. Admin create, update, and delete actions automatically invalidate the
homepage content.

## 7. Deployment Notes

- **Frontend:** deploy `frontend` to a Next.js-compatible host and set
  `BACKEND_API_URL` to the deployed Express API.
- **Backend:** deploy to Render, Railway, or a VPS; set `MONGO_URI` to your
  Atlas connection string and `CLIENT_ORIGIN` to your deployed frontend URL.
- Point `duneandgrills.com` (and `www.duneandgrills.com`) at your frontend
  host, and use a subdomain like `api.duneandgrills.com` for the backend.
