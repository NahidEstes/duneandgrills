"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext.jsx";
import AdminShell from "@/src/components/admin/AdminShell.jsx";
import FinanceDashboard from "./FinanceDashboard.jsx";
import ExpenseEntries from "./ExpenseEntries.jsx";
import ExpenseReports from "./ExpenseReports.jsx";
import { ExpenseCategories, RecurringExpenses } from "./FinanceManagement.jsx";

const sections = [
  ["dashboard", "Overview", "/admin/expenses"], ["entries", "Entries", "/admin/expenses/entries"], ["recurring", "Recurring", "/admin/expenses/recurring"], ["categories", "Categories", "/admin/expenses/categories"], ["reports", "Reports", "/admin/expenses/reports"],
];

export default function FinanceExpensesPage({ section = "dashboard" }) {
  const { user, logout } = useAuth(); const router = useRouter(); const canManage = ["admin", "accountant"].includes(user?.role);
  const onTabChange = (tab) => { if (tab === "expenses") return; router.push(`/admin?tab=${tab}`); };
  return <AdminShell activeTab="expenses" onTabChange={onTabChange} title="Finance & Expenses" subtitle="Track operating expenses, bills and recurring commitments without mixing inventory purchases." user={user} onLogout={logout} dashboard={null} searchQuery="" onSearchChange={() => {}} searchResults={[]} searching={false}>
    <div className="mx-auto max-w-[1680px]"><div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-1">{sections.map(([id, label, href]) => <Link key={id} href={href} className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition ${section === id ? "bg-dune-amber text-black" : "text-neutral-400 hover:bg-white/5 hover:text-white"}`}>{label}</Link>)}</div>{!canManage && <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.07] p-3 text-xs text-blue-200">Manager access is read-only. An admin must create, update, generate or archive financial records.</div>}{section === "dashboard" && <FinanceDashboard canManage={canManage} />}{section === "entries" && <ExpenseEntries canManage={canManage} />}{section === "recurring" && <RecurringExpenses canManage={canManage} />}{section === "categories" && <ExpenseCategories canManage={canManage} />}{section === "reports" && <ExpenseReports />}</div>
  </AdminShell>;
}
