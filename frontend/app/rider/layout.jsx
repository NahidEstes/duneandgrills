import StaffGuard from "@/src/security/serverSession.js";

export const metadata = {
  title: "Rider Portal | Dune & Grills",
  robots: { index: false, follow: false },
};
export default function RiderLayout({ children }) {
  return <StaffGuard basePath="/rider">{children}</StaffGuard>;
}
