// Preview is only allowed on an explicitly named, loopback-only disposable database.
// Phase 1 never activates dispatch, even if the future activation flag is set.
export function riderConfiguration(env = process.env) {
  let isolated = false;
  try {
    const uri = new URL(env.MONGO_URI || "");
    const database = uri.pathname.slice(1);
    isolated = uri.protocol === "mongodb:" && ["localhost", "127.0.0.1", "[::1]"].includes(uri.hostname)
      && !uri.username && !uri.password
      && (/^dg_rider_(preview|test)(_[a-z0-9]+)?$/.test(database)
        || (env.NODE_ENV === "test" && database === "dg_record_id_test"));
  } catch { /* Missing, remote or replica-host-list URIs fail closed. */ }
  return Object.freeze({
    operationalEnabled: false,
    activationRequested: env.RIDER_DELIVERY_ENABLED === "true",
    previewEnabled: env.RIDER_PREVIEW_ENABLED === "true"
      && ["development", "test"].includes(env.NODE_ENV) && isolated,
  });
}
