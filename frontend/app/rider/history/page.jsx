import RiderPortal from "@/src/components/rider/RiderPortal.jsx";

export default async function RiderHistoryPage({ searchParams }) {
  return <RiderPortal section="history" preview={(await searchParams)?.preview === "1"} />;
}
