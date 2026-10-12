import RiderPortal from "@/src/components/rider/RiderPortal.jsx";

export default async function RiderPage({ searchParams }) {
  const query = await searchParams;
  return <RiderPortal section="deliveries" preview={query.preview === "1"} rehearsal={query.rehearsal === "1"} />;
}
