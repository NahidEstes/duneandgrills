// Used only with runFunctionalBrowserRegressions.mjs's owned loopback auth fixture.
export async function setFixtureSession(context, origin, role) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error("Owned local fixture required");
  await context.addCookies([{ name: "dg_session", value: `owned-browser-${role}`, url: origin, httpOnly: true, sameSite: "Lax" }]);
}
