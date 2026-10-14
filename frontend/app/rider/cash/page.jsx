import RiderPortal from "@/src/components/rider/RiderPortal.jsx";

export default async function RiderCashPage({ searchParams }) {
  const query = await searchParams;
  return <RiderPortal section="cash" preview={query.preview === "1"} rehearsal={query.rehearsal === "1"} />;
}
