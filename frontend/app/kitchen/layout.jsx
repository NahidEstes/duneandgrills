import StaffGuard from "@/src/security/serverSession.js";
export const metadata = { manifest: "/kitchen/manifest.webmanifest", appleWebApp: { capable: true, title: "Dune Kitchen", statusBarStyle: "black-translucent" } };
export default function Layout({ children }) { return <StaffGuard basePath="/kitchen">{children}</StaffGuard>; }
