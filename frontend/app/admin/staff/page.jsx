import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import StaffOperationsPage from "@/src/components/admin/staff/StaffOperationsPage.jsx";

export const metadata = { title: "Staff Management", robots: { index: false, follow: false } };

export default function StaffPage() {
  return <ProtectedRoute roles={["admin", "manager"]}><StaffOperationsPage section="employees" /></ProtectedRoute>;
}
