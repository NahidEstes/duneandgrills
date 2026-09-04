import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import PosWorkspace from "@/src/components/pos/PosWorkspace.jsx";

export const metadata = {
  title: "POS / New Sale",
  robots: { index: false, follow: false },
};

export default function PosPage() {
  return (
    <ProtectedRoute roles={["admin", "manager"]}>
      <PosWorkspace />
    </ProtectedRoute>
  );
}
