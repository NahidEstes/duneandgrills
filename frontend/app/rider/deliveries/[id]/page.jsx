import RiderDeliveryDetails from "@/src/components/rider/RiderDeliveryDetails.jsx";
export default async function Page({ params, searchParams }) {
  const query = await searchParams;
  return <RiderDeliveryDetails id={(await params).id} preview={query.preview === "1"} rehearsal={query.rehearsal === "1"} />;
}
