# Admin and Inventory themes

The existing Dark Mode is the default. Light Mode is optional; there is no System setting and operating-system theme changes do not change the workspace.

- Desktop Admin: use the sun/moon switch in the header. On small screens, open **Account menu** and use **Light mode**.
- Inventory: use the sun/moon switch in the header.
- Both workspaces share the `dg-workspace-theme` browser preference. It survives refresh and navigation and synchronizes across tabs. If this preference cannot be stored, the switch still works for the visit, with an accessible status explaining that it cannot be remembered.
- Public pages, login, POS, Kitchen and Rider retain their existing appearance. Leaving Admin/Inventory removes the workspace theme from the document.

## Appearance and safeguards

`WorkspaceThemeProvider` only manages appearance. It does not call business APIs or remount route content. Switching does not submit forms, reset quantities/units, discard recipe drafts, or bypass confirmations and access rules. No stock, costing, production, permissions, database schemas or historical records were changed.

The root's small bootstrap uses the existing CSP nonce to restore an explicit saved Light preference before paint. Missing, invalid or unavailable storage falls back to Dark. The client handles navigation and storage events without adding a cookie or changing session security.

`src/theme/tailwindWorkspaceTheme.mjs` supplies light-only colour tokens for existing Tailwind foregrounds, surfaces, borders, status text and shadows. Original colours remain the fallbacks, including alpha, hover and focus variants. `app/workspace-theme.css` covers legacy arbitrary dark surfaces, shared portals, native controls, scrollbars and custom toasts. Delivery CSS uses matching tokens with its exact original colour fallbacks. Layout, imagery and print exports are retained; no inversion filters are used.

New components should reuse the shared palettes and UI components. If a new arbitrary surface colour is introduced, add its light adapter or use a semantic surface token. Keep brand/status colours distinct and check normal text, tinted badges, disabled controls and overlays in both modes.

## Verification

- `node --test tests/*.test.js tests/*.test.mjs` in `frontend`.
- `npm run lint` and `npm run build` in `frontend`.
- `node tests/workspaceThemeBrowser.mjs` uses an owned disposable Mongo replica and loopback Express/production Next servers. Set `MONGOD_BINARY` and, when needed, `PLAYWRIGHT_MODULE`. It checks 1440/390/320px, the default and persisted modes, Admin/Inventory navigation, keyboard and cross-tab changes, blocked storage, public-page isolation, unsaved preparation quantities/units, ingredient/date/notification portals, stock review and delivery drawers. It checks accessibility/overflow and compares stock, cost and recipe records before/after.
- Existing preparation and stock/cost regression suites remain applicable; no live database is needed.

The installed Next.js version emits an existing security advisory during builds; upgrading that dependency is separate from this appearance change.
