import RiderPortal from "@/src/components/rider/RiderPortal.jsx";

export default async function RiderProfilePage({ searchParams }) {
  const query = await searchParams;
  return <RiderPortal section="profile" preview={query.preview === "1"} rehearsal={query.rehearsal === "1"} />;
}
