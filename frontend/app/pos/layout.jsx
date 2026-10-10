import StaffGuard from "@/src/security/serverSession.js";
export const metadata = { manifest: "/pos/manifest.webmanifest", appleWebApp: { capable: true, title: "Dune POS", statusBarStyle: "black-translucent" } };
export default function Layout({ children }) { return <StaffGuard basePath="/pos">{children}</StaffGuard>; }
