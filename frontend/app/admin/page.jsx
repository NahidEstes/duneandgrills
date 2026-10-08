import { Suspense } from "react";
import AdminDashboard from "@/src/components/AdminDashboard.jsx";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";

export const metadata = {
  title: "Admin Dashboard",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <ProtectedRoute roles={["admin", "manager"]}>
      <Suspense fallback={<div className="p-8 text-neutral-400">Loading admin dashboard…</div>}><AdminDashboard /></Suspense>
    </ProtectedRoute>
  );
}
