import RiderPortal from "@/src/components/rider/RiderPortal.jsx";

export default async function RiderProfilePage({ searchParams }) {
  return <RiderPortal section="profile" preview={(await searchParams)?.preview === "1"} />;
}
