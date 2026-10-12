import PublicSharedContent from "@/src/components/PublicSharedContent.jsx";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }) { const { id } = await params; return { title: "Shared offer | Dune & Grills", alternates: { canonical: `/offer/${encodeURIComponent(id)}` } }; }
export default async function OfferPage({ params }) { const { id } = await params; return <PublicSharedContent kind="offer" id={id} />; }
