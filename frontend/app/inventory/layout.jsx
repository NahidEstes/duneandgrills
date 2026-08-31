import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import InventoryShell from "@/src/components/inventory/InventoryShell.jsx";

export default function InventoryLayout({ children }) {
  return (
    <ProtectedRoute roles={["admin", "manager"]}>
      <InventoryShell>{children}</InventoryShell>
    </ProtectedRoute>
  );
}
