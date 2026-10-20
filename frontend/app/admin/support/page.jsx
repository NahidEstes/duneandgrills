import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import CustomerOperationsPage from "@/src/components/admin/CustomerOperationsPage.jsx";
export const metadata = { title: "Order Support", robots: { index: false, follow: false } };
export default function Page() { return <ProtectedRoute roles={["admin", "manager"]}><CustomerOperationsPage section="support" /></ProtectedRoute>; }
