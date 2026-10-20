import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import PlannerPage from "@/src/components/admin/planner/PlannerPage.jsx";
import { Suspense } from "react";
export const metadata = { title: "Restaurant Planner", robots: { index: false, follow: false } };
export default function Page() { return <ProtectedRoute roles={["admin", "manager"]}><Suspense fallback={<p className="p-8 text-neutral-400">Loading Planner…</p>}><PlannerPage /></Suspense></ProtectedRoute>; }
