import DeliveryManagement from "@/src/components/admin/delivery/DeliveryManagement.jsx";
export const metadata = { title: "Delivery Management", robots: { index: false, follow: false } };
export default async function Page({ searchParams }) {
  const query = await searchParams;
  return <DeliveryManagement preview={query.preview === "1"} rehearsal={query.rehearsal === "1"} />;
}
