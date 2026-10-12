import RiderPortal from "@/src/components/rider/RiderPortal.jsx";

export default async function RiderPage({ searchParams }) {
  return <RiderPortal section="deliveries" preview={(await searchParams)?.preview === "1"} />;
}
