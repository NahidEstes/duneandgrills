import InventoryAccess from "@/src/components/inventory/InventoryAccess.jsx";
import InventoryShell from "@/src/components/inventory/InventoryShell.jsx";

export default function InventoryLayout({ children }) {
  return (
    <InventoryAccess>
      <InventoryShell>{children}</InventoryShell>
    </InventoryAccess>
  );
}
