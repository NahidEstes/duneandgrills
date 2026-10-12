import PublicSharedContent from "@/src/components/PublicSharedContent.jsx";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }) { const { id } = await params; return { title: "Shared combo | Dune & Grills", alternates: { canonical: `/combo/${encodeURIComponent(id)}` } }; }
export default async function ComboPage({ params }) { const { id } = await params; return <PublicSharedContent kind="combo" id={id} />; }
