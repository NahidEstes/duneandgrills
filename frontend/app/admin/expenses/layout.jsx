"use client";

import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";

export default function ExpensesLayout({ children }) {
  return <ProtectedRoute roles={["admin", "manager", "accountant"]}>{children}</ProtectedRoute>;
}
