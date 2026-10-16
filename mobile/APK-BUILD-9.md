# Android preview APK — build 9

Built on 2026-10-16 using the existing EAS project and managed Android signing key. This is a standalone internal preview APK using the staging API; it runs without Metro or Expo Go.

- [Download APK](https://expo.dev/artifacts/eas/ix9yBIQPuwUUowu2vjdZu--lse3O0y1OPW37ZAdHuZQ.apk)
- [EAS build](https://expo.dev/accounts/nahidestes/projects/dune-and-grills/builds/e6a5096a-5ab0-4bd2-a788-ad633e721bbe)
- Local file: `mobile/artifacts/dune-and-grills-preview-1.0.0-build-9.apk` (ignored)
- Version: `1.0.0`; Android versionCode: `9`
- Package: `com.duneandgrills.customer`; minimum API 24, target API 36
- Source commit: `db6a5f410538ccd48cdde696ce71bf3c646cc1a8`
- Size: 113,705,408 bytes
- SHA-256: `001dcd015d34e60691e2f05f56181d024066d2919f44bfcd29e8f7e7a8fff6d0`
- Signing certificate SHA-256: `4dab029aa9cca591ce2f58bcae345ae0c28744f154649c84275142c94527e92f`

## Verification

75 mobile tests, TypeScript and lint passed before building. EAS completed successfully using the preview profile and existing remote credentials. APK Signature Scheme v2 verification passed; package/version, all four Android CPU architectures and foreground location permissions were checked. No background location permission or debuggable application flag was present in the badging output.

A fresh installation on the existing Android 15 x86_64 emulator succeeded. Cold launch, Home catalog loading, Profile navigation, English-to-Arabic translation with RTL navigation, Arabic persistence after force-stop/relaunch, and switching back to English were checked. The collected app-process log showed no fatal exception. Screenshots and verification outputs are ignored under `mobile/artifacts/`.

This smoke test did not exercise physical-device GPS, native account sign-in, order submission, points redemption or refunds. No test customer/order was created, backend deployed, app store submission made or paid service activated during this build.

## Configuration still required

The preview API is `https://duneandgrills-testing-six.vercel.app/api`. Its read-only configuration endpoints responded successfully; points redemption, delivery-area enforcement and scheduling were disabled at verification time. An administrator must configure and approve their policies before those features become active.

No Android Google Maps API key was configured for this build. Delivery pin selection therefore uses the manual-coordinate fallback. Enabling the native map requires the configured key and a new native build. See [feature configuration](CHECKOUT-FEATURES.md).

Install updates with the same signing key. Preserve any existing app data containing unresolved orders; do not uninstall or clear it to bypass an update problem. Keep a local copy of the APK because the hosted artifact may expire.
