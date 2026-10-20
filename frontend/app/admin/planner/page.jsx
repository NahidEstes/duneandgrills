import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import PlannerPage from "@/src/components/admin/planner/PlannerPage.jsx";
export const metadata = { title: "Restaurant Planner", robots: { index: false, follow: false } };
export default function Page() { return <ProtectedRoute roles={["admin", "manager"]}><PlannerPage /></ProtectedRoute>; }
