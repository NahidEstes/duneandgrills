"use client";

import { usePathname } from "next/navigation";
import ProtectedRoute from "../ProtectedRoute.jsx";
import { inventoryPageRoles } from "./inventoryAccess.js";

export default function InventoryAccess({ children }) {
  return <ProtectedRoute roles={inventoryPageRoles(usePathname())}>{children}</ProtectedRoute>;
}
