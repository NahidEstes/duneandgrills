import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import QuickDeliveryOrderPage from "@/src/components/admin/delivery/QuickDeliveryOrderPage.jsx";

export const metadata = { title: "Quick Delivery Order", robots: { index: false, follow: false } };

export default function QuickDeliveryPage() {
  return <ProtectedRoute roles={["admin", "manager", "cashier"]}><QuickDeliveryOrderPage /></ProtectedRoute>;
}
