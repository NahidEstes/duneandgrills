import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import KitchenDisplay from "@/src/components/kitchen/KitchenDisplay.jsx";

export const metadata = {
  title: "Kitchen Display",
  robots: { index: false, follow: false },
};

export default function KitchenPage() {
  return (
    <ProtectedRoute roles={["admin", "manager", "kitchen"]}>
      <KitchenDisplay />
    </ProtectedRoute>
  );
}
