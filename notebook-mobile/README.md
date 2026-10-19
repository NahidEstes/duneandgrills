# Dune & Grills Notebook

Independent Expo SDK 57 staff notebook, with the approved black/amber restaurant design and English-only interface. The customer and rider apps keep their own identities. This app uses com.duneandgrills.notebook.

## Implemented

- Home with pending count, current-day SAR totals and recent notes.
- Quick text entry; only the note text is required. Optional category, payment, amount, title, quantity and receipt.
- Camera/gallery receipts compressed to JPEG and stored with the note, rather than referencing temporary picker files.
- Details, full-size receipt preview, editing and an idempotent “Mark as Entered” action.
- Entered notes are read-only; corrections require a separate note.
- Search and combined status, category and Riyadh date-range filters.
- Unsaved-change navigation guard, loading, empty, validation and storage-error states.
- Offline native persistence using SQLite key/value storage; browser preview persistence using IndexedDB.
- English browser voice input where Web Speech is available; explicit keyboard-dictation guidance on native/unsupported devices. Browser recognition can require a connection and microphone permission.
- Optional staff sign-in and foreground/reconnect sync, with pending upload snapshots persisted before sending.
- Stable request IDs, compare-and-set revisions, visible conflict resolution, and account/server binding. An edit made during an upload remains queued after the previous version is acknowledged.
- Native tokens in SecureStore; browser-preview tokens stay in memory and require sign-in after refresh.

This is a notebook, not an accounting posting system. Neither saving nor marking a note changes inventory, invoices, expenses or payments. No sample notes are seeded into a real notebook.

## Local preview

    Set-Location -LiteralPath 'D:\My Projects\duneandgrills\notebook-mobile'
    npm ci
    npx expo export --platform web
    npm run preview

Open http://127.0.0.1:8128. The browser is a diagnostic preview of the native app; it is not an installable offline PWA. The exported preview needs its local server when opening/reloading the app, while already-loaded screens can capture notes offline.

For native development, run npm start and use a matching SDK 57 Expo Go installation or a development build. A new native binary must be built from this independent app for installation outside Expo Go. No EAS project, APK, store submission, OTA update or deployment was created for this implementation.

## Optional cloud backup

The default is device-only. There is deliberately no default staging or production API.

Copy .env.example to .env, and set EXPO_PUBLIC_API_URL to an owned backend ending in /api. On a physical phone, use a reachable LAN address for local development; the phone cannot use the PC’s localhost. Release environments require HTTPS. Public Expo settings must never contain passwords or signing keys.

Deploy the accompanying backend changes before connecting to a deployed server. Browser development additionally needs its exact origin in the backend’s existing CLIENT_ORIGINS allowlist. Native requests use bearer authorization without browser cookies.

Active admin, manager, cashier, kitchen, inventory, storekeeper and accountant accounts can connect. Customers and riders cannot. Notes belong to the authenticated staff member; one account does not read another member’s notes.

The first successful connection binds the local notebook to that staff member and server. Local notes join that account. Disconnecting preserves the notebook and its binding; reconnect using the original account. When disconnected, notes remain available on the device. Do not clear app/browser data to resolve a sync failure.

Backend endpoints:

- POST /api/notebook/login — sanitized native staff bearer session.
- GET /api/notebook/notes?after=<cursor> — owner-scoped pages of 10 notes.
- PUT /api/notebook/notes/:uuid — revision-checked, idempotent note save/completion.

The new collection is NotebookNote, with a unique (owner, clientId) index. Ensure this index is created before enabling writes in deployments that disable automatic MongoDB index creation. Only notebook requests have a 1 MB JSON limit; existing API limits stay at 100 KB.

## Verification

Verified locally on 19 October 2026: TypeScript, ESLint, SDK dependency compatibility, 6 domain tests, 8 notebook backend checks, 5 existing rider-auth regression checks, both browser suites, and Android/iOS/web exports passed. Browser checks used owned isolated data and blocked external traffic. Android/iOS exports compile JavaScript/Hermes bundles; they are not installed APK/IPA binaries.

    npm run typecheck
    npm run lint
    npm test
    npx expo install --check
    npx expo export --platform all

Backend checks, from backend/:

    node --test tests/notebook.test.js tests/riderMobileAuth.test.js

These run the actual routes, session middleware and note service with owned in-memory persistence. They do not claim real MongoDB integration or contact live restaurant data.

Browser checks require Playwright and Chrome. Set PLAYWRIGHT_MODULE to an installed Playwright module when it is outside this package.

    npm run test:browser

This checks actual receipt selection/preview/reload, editing, completion, totals, search/status/date filters, unsaved-change handling, offline save, English UI and 320/390/768px layouts. Screenshots are saved to ignored artifacts/.

For the isolated sync fixture:

    $env:EXPO_PUBLIC_API_URL = 'http://notebook.fixture.invalid/api'
    npx expo export --platform web --output-dir dist-fixture
    Remove-Item Env:EXPO_PUBLIC_API_URL
    npm run test:sync

The fixture intercepts only its owned API and blocks external traffic. It exercises edits during upload, server conflicts, lost-response retries after restart, duplicate prevention, completion and account binding. The dist-fixture folder is excluded from Git and EAS uploads. The project-specific Metro cache version keeps manifests and API environments separate from sibling apps.

Physical Android/iOS execution, camera permissions on hardware, native SecureStore/SQLite runtime, live speech recognition and deployed cloud sync still need device/deployment verification. The installed dependency tree reports advisories; incompatible forced upgrades were not applied.

## References used for SDK compatibility

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [Expo ImagePicker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/)
- [Expo ImageManipulator](https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator/)
- [Expo SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Web Speech recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [Metro cache configuration](https://metrobundler.dev/docs/configuration/#cacheversion)
