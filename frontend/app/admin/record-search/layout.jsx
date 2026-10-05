"use client";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
export default function Layout({ children }) {
  return <ProtectedRoute roles={["admin", "manager", "cashier", "inventory", "storekeeper", "accountant"]}>{children}</ProtectedRoute>;
}
