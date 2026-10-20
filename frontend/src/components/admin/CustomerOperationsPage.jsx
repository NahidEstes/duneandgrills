"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminShell from "./AdminShell.jsx";
import { useAuth } from "@/src/context/AuthContext.jsx";
import SupportManagement from "./SupportManagement.jsx";
import DiningTablesManagement from "./DiningTablesManagement.jsx";

export default function CustomerOperationsPage({ section }) {
  const router = useRouter(), { user, logout } = useAuth();
  return <AdminShell activeTab={section} onTabChange={tab => { router.push(`/admin?tab=${tab}`); return true; }} title={section === "support" ? "Order Support" : "Tables & QR Ordering"} subtitle={section === "support" ? "Handle order issues and keep customer replies separate from internal notes." : "Manage dining tables and print QR codes for the existing menu."} user={user} onLogout={logout} showGlobalSearch={false} showOrderControls={false}>
    <nav aria-label="Customer operations" className="mb-5 flex flex-wrap gap-3">{[["support", "Order Support"], ["tables", "Tables & QR"]].map(([id, label]) => <Link key={id} href={`/admin/${id}`} aria-current={section === id ? "page" : undefined} className={`min-h-11 rounded-xl border px-4 py-3 text-sm ${section === id ? "border-dune-amber/40 bg-dune-amber/10 text-dune-amber" : "border-white/10 text-neutral-400"}`}>{label}</Link>)}</nav>
    {section === "support" ? <SupportManagement /> : <DiningTablesManagement />}
  </AdminShell>;
}
