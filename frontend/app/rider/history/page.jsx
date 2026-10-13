import RiderPortal from "@/src/components/rider/RiderPortal.jsx";

export default async function RiderHistoryPage({ searchParams }) {
  const query = await searchParams;
  return <RiderPortal section="history" preview={query.preview === "1"} rehearsal={query.rehearsal === "1"} initialCashStatus={query.cashStatus} />;
}
