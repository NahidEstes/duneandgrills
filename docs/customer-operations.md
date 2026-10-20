# Order support, table QR ordering and cart suggestions

New interface text is English. Existing customer languages, order creation,
customization, inventory, rewards and payment workflows remain in use.

## Setup and use

- Install frontend dependencies with `npm ci`. QR images are generated locally
  using the pinned `qrcode` package; table links are not sent to an external QR service.
- Admins and managers can open **Tables & QR** at `/admin/tables`, add a table,
  edit its code/name/availability, and download or print its QR code. Generate
  printed QRs on the intended customer-facing domain, because they use that domain.
- In **Menu Items**, edit a dish and choose up to eight **Complete your meal
  suggestions**. The cart displays at most three available complementary items.
- Customers open **Get help with this order** from their account order details
  or from a verified guest tracking result. Admins/managers handle these cases
  at `/admin/support`. Search uses the order number; status filters and pagination
  are available.

## Behaviour

- One support conversation per order consolidates all issues. Missing/wrong-item
  reports require affected items. Replies and status/resolution updates are
  explicit. A closed conversation is read-only for customers; staff can reopen it.
- Internal notes are never included in customer API responses. Resolution text
  is always customer-visible, even when the accompanying message is internal.
- A logged-in customer must own the order. Guests use the existing private
  tracking code in a request header, never a URL. Staff require order management
  permission; viewing arbitrary customer cases through the customer route is not allowed.
- Support does not issue refunds, change payment/order status, restore stock or
  adjust rewards. Existing order/refund controls remain separate.
- QR codes contain a random table token. The backend resolves its hash and
  snapshots the table code/name onto the order. The token grants no staff access.
  Table availability is rechecked inside the order transaction. Deactivation
  blocks new orders and preserves existing orders and idempotent recovery.
- Table orders are immediate dine-in orders. They use normal checkout and remain
  unpaid until the existing payment workflow records payment. Table information
  appears in order details, kitchen tickets and printable order invoices.
- Table context is kept in the current browser tab. Scanning another table changes
  the destination while retaining cart items. Selecting pickup/delivery, continuing
  without a table or logging out clears the context. Invalid links require retry
  or explicitly continuing without a table.
- Suggestions are opt-in additions with current prices. Unavailable/duplicate
  items, inactive categories and products with missing recipes or insufficient
  base recipe stock are filtered. Customizable products open the existing item
  editor. Final stock, selected add-ons and prices are revalidated during checkout.

## Storage and deployment

`OrderSupport` and `DiningTable` are new collections with unique indexes for
one conversation per order, table code and table-token hash. Release readiness
checks these indexes. Existing documents require no data backfill; new table
snapshots and complementary-item references are additive fields. If automatic
index creation is disabled in the deployment, provision the declared schema
indexes before enabling the new flows. No existing indexes need to be dropped.

## Verification

Run from `backend` with `MONGOD_BINARY` pointing to a local MongoDB executable:

```powershell
node --test tests/customerOperationsIntegration.js
```

This creates and removes its own temporary replica set. It never reads the
configured application database.

For the actual frontend/browser flows, first build `frontend`, then run the same
test with `RUN_CUSTOMER_OPERATIONS_BROWSER=1`. Set `PLAYWRIGHT_MODULE` to a local
Playwright package directory if it is not installed on the normal module path.
The test uses installed Chrome, disposable frontend/backend servers and the
temporary database. Screenshots are written to the OS temporary directory by
default, or to `CUSTOMER_OPERATIONS_ARTIFACT_DIR` when supplied.
