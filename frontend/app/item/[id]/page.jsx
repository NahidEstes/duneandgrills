import PublicSharedContent from "@/src/components/PublicSharedContent.jsx";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }) { const { id } = await params; return { title: "Shared food | Dune & Grills", alternates: { canonical: `/item/${encodeURIComponent(id)}` } }; }
export default async function ItemPage({ params }) { const { id } = await params; return <PublicSharedContent kind="item" id={id} />; }
