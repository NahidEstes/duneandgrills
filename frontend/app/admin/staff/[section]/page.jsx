import { notFound } from "next/navigation";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import StaffOperationsPage from "@/src/components/admin/staff/StaffOperationsPage.jsx";

const sections = new Set(["attendance", "shifts", "leave"]);
export const metadata = { title: "Staff Operations", robots: { index: false, follow: false } };

export default async function StaffSectionPage({ params }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return <ProtectedRoute roles={["admin", "manager"]}><StaffOperationsPage section={section} /></ProtectedRoute>;
}
