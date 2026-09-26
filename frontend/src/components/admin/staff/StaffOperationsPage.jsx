"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarOff, Clock3, UsersRound } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext.jsx";
import AdminShell from "@/src/components/admin/AdminShell.jsx";
import StaffManagement from "@/src/components/admin/StaffManagement.jsx";
import AttendanceDashboard from "./AttendanceDashboard.jsx";
import LeaveManagement from "./LeaveManagement.jsx";
import ShiftManagement from "./ShiftManagement.jsx";

const sections = [
  { id: "employees", label: "Employees", href: "/admin/staff", icon: UsersRound },
  { id: "attendance", label: "Attendance", href: "/admin/staff/attendance", icon: CalendarCheck },
  { id: "shifts", label: "Shifts", href: "/admin/staff/shifts", icon: Clock3 },
  { id: "leave", label: "Leave", href: "/admin/staff/leave", icon: CalendarOff },
];
const headings = {
  employees: ["Staff", "Manage employee profiles, access and secure time-clock settings."],
  attendance: ["Staff Attendance", "Track your team's attendance and working hours"],
  shifts: ["Shift Management", "Configure scheduled hours, working days and grace periods."],
  leave: ["Leave Management", "Review time off and keep absence calculations accurate."],
};

export default function StaffOperationsPage({ section = "employees" }) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [title, subtitle] = headings[section] || headings.employees;
  return <AdminShell activeTab="staff" onTabChange={(tab) => { router.push(`/admin?tab=${tab}`); return true; }} title="" subtitle="" user={user} onLogout={logout} showGlobalSearch={false} showOrderControls={false} showPageHeading={false} showSidebarUserCard>
    <div className="space-y-5"><header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-dune-amber">People Operations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">{title}</h1><p className="mt-1 text-sm text-neutral-500">{subtitle}</p></div><Link href="/staff-clock" target="_blank" rel="noopener noreferrer" className="flex h-11 w-fit items-center gap-2 rounded-xl border border-dune-amber/30 px-4 text-sm font-semibold text-dune-amber hover:bg-dune-amber/10"><Clock3 className="h-4 w-4" />Open Staff Clock</Link></header>
      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-white/[0.08] bg-white/[0.02] p-2" aria-label="Staff management sections">{sections.map(({ id, label, href, icon: Icon }) => <Link key={id} href={href} aria-current={section === id ? "page" : undefined} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${section === id ? "bg-dune-amber text-black" : "text-neutral-400 hover:bg-white/[0.05] hover:text-white"}`}><Icon className="h-4 w-4" />{label}</Link>)}</nav>
      {section === "employees" && <StaffManagement />}
      {section === "attendance" && <AttendanceDashboard />}
      {section === "shifts" && <ShiftManagement />}
      {section === "leave" && <LeaveManagement />}
    </div>
  </AdminShell>;
}
