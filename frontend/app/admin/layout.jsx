import StaffGuard from "@/src/security/serverSession.js";
export default function Layout({ children }) { return <StaffGuard basePath="/admin">{children}</StaffGuard>; }
