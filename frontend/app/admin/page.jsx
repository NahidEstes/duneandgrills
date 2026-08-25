import AdminDashboard from "@/src/components/AdminDashboard.jsx";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";

export const metadata = {
  title: "Admin Dashboard",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <ProtectedRoute roles={["admin", "manager"]}>
      <AdminDashboard />
    </ProtectedRoute>
  );
}
