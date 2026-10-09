import { Suspense } from "react";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import RecipeInstructions from "@/src/components/kitchen/recipes/RecipeInstructions.jsx";

export const metadata = { title: "Recipe Instructions", robots: { index: false, follow: false } };
export default function RecipeInstructionsPage() {
  return <ProtectedRoute roles={["admin", "manager", "kitchen"]}><Suspense fallback={<p className="p-8 text-neutral-400">Loading recipe workspace…</p>}><RecipeInstructions /></Suspense></ProtectedRoute>;
}
