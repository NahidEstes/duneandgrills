import RiderPortal from "@/src/components/rider/RiderPortal.jsx";

export default async function RiderDeliveriesPage({ searchParams }) {
  const query = await searchParams;
  return <RiderPortal section="deliveries" initialStatus={query.status} preview={query.preview === "1"} rehearsal={query.rehearsal === "1"} />;
}
