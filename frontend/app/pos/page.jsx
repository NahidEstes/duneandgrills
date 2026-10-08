import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import PosWorkspace from "@/src/components/pos/PosWorkspace.jsx";

export const metadata = {
  title: "POS / New Sale",
  robots: { index: false, follow: false },
};

export default async function PosPage({ searchParams }) {
  const query = await searchParams;
  const shiftLink = { history: ["open", "closed", "all"].includes(query?.shiftHistory) ? query.shiftHistory : "", id: typeof query?.shift === "string" && /^[a-f0-9]{24}$/i.test(query.shift) ? query.shift : "" };
  return (
    <ProtectedRoute roles={["admin", "manager", "cashier"]}>
      <PosWorkspace shiftLink={shiftLink} />
    </ProtectedRoute>
  );
}
