import RecordSearchPage from "@/src/components/admin/records/RecordSearchPage.jsx";
export default async function Page({ searchParams }) {
  const params = await searchParams;
  return <RecordSearchPage detailType={typeof params.type === "string" ? params.type : ""} detailId={typeof params.id === "string" ? params.id : ""} />;
}
