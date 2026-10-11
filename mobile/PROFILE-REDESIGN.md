# Profile redesign

Only the native customer app in `mobile/` was changed. Profile uses the existing black/charcoal/orange design system, actual customer identity and supported avatar, dedicated account editing, order/address shortcuts, grouped account/help rows, orange-outline logout and the configured app version. The four existing tabs remain unchanged.

`/profile-edit` edits name, email and optional phone through `PATCH /auth/me`. It validates input, disables repeated saves, preserves failed drafts and updates the session user through the existing secure persistence method. Duplicate-email conflicts now show a relevant message. Responses from a departed account screen cannot update its successor.

`/addresses` shares an account-scoped address hook with delivery selection and reads the same `/profile/addresses` collection as checkout. Add/edit use the existing `/address/[id]` route and APIs; default changes and confirmed deletion refresh the collection and session. Deletion has Cancel, retryable errors and native back dismissal. Saving from the manager returns to its existing stack entry. Existing address and selector deep links retain their destinations.

Guests see sign-in/register and guest order tracking, without cached account data or logout. The existing expired-session cart recovery action remains available when needed. Authentication, protected storage, account cart ownership and pending order recovery are retained. Logout is disabled while an order is unresolved, with a shortcut to recovery.

## Restaurant configuration

Contact uses public restaurant settings: configured phone first, then receipt phone, then configured WhatsApp. Missing or invalid contact data renders an explanatory row; failure to open an app displays the configured contact. A read-only staging settings check confirmed a phone is present and WhatsApp is empty. No settings were written.

No actual privacy/terms content or verified policy destination exists in the current application. The Help group displays “Policy content is not available yet.” as informational text, without a dead button. Restaurant-provided policy content or a verified destination is still needed.

## Verification

- `npm run typecheck`, `npm run lint`, `npm test`: 42 functional tests.
- `npx expo export --platform all --max-workers 2`: local Android/iOS JavaScript and Hermes bundles plus web export. This is not an APK or cloud build.
- `tests/design-smoke.cjs`: existing Home/Menu/Cart, checkout address draft, guest account/history and responsive regression checks.
- `node tests/profile-harness.cjs`, followed by `node tests/profile-smoke.cjs`: authenticated Profile browser diagnostics using the actual screens, navigation, app provider and protected-store implementation in an ignored temporary copy. Only native secure storage and the dialer adapter are substituted for browser verification. All API writes are intercepted fixtures; production code has no test login or storage bypass.

The browser tests require Playwright and Chrome. Set `PLAYWRIGHT_MODULE` to an installed Playwright package if it is outside the app dependencies. They use the existing read-only `artifacts/catalog-snapshot.json` settings fixture. The isolated export and screenshots are under ignored `mobile/artifacts/`; source copies are excluded from the main TypeScript project.

Profile diagnostics cover guest/login states and registration navigation, guest tracking, initials/avatar failure, profile validation/save/conflict/outage with draft retention, address add/edit/default/delete/Cancel/retry, shared checkout address data, order detail/reorder navigation, logout data cleanup, pending logout guard, session expiry without exposed account addresses, configured contact URL/open failure/missing contact, and missing policy content. Screenshots cover 320/390/430-pixel widths, long names and 130% browser text sizing. Images were visually inspected against the supplied reference.

No native Android or iOS device or simulator was tested. Browser diagnostics cannot establish native keyboard, system font scaling, gesture/back behavior, dialer launch or Keychain/Keystore behavior. Those checks remain for an installed native build. No commit, push, deployment or APK/cloud build was performed.

## Screenshots

- `artifacts/profile-signed-in-390.png`: signed-in summary.
- `artifacts/profile-help-390.png`: help, logout and app version.
- `artifacts/profile-guest-390.png`: guest state.
- `artifacts/profile-addresses-390.png`: address manager.
- `artifacts/profile-delete-confirmation-390.png`: deletion confirmation.
- `artifacts/profile-edit-error-390.png`: retained profile draft after service failure.
- `artifacts/profile-long-name-large-text-320.png`: narrow screen with long identity and larger browser text.
