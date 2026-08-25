import BlogPage from "@/src/components/BlogPage.jsx";
import JsonLd from "@/src/components/JsonLd.jsx";
import { getBlogPosts, getSidebarData } from "@/src/api/server.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Blog",
  description:
    "Read grilling recipes, kitchen stories, nutrition guides and restaurant news from Dune & Grills.",
  alternates: { canonical: "/blog" },
  openGraph: {
    url: "/blog",
    title: "Stories from the Grill | Dune & Grills",
    description:
      "Recipes, kitchen stories and lessons about fire-grilled flavor.",
  },
};

export default async function BlogListingPage({ searchParams }) {
  const query = await searchParams;
  const activeCategory = query?.category || "All";
  const activeSearch = query?.search || "";

  let posts = [];
  let initialStatus = "success";

  try {
    posts = await getBlogPosts({
      category: activeCategory === "All" ? undefined : activeCategory,
      search: activeSearch || undefined,
    });
  } catch {
    initialStatus = "error";
  }

  const sidebarData = await getSidebarData();
  const blogData = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Dune & Grills Journal",
    url: "https://duneandgrills.com/blog",
    description:
      "Recipes, kitchen stories and lessons about fire-grilled flavor.",
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.excerpt,
      image: post.coverImage,
      url: `https://duneandgrills.com/blog/${post.slug}`,
      datePublished: post.createdAt,
      author: { "@type": "Person", name: post.author },
    })),
  };

  return (
    <>
      <JsonLd data={blogData} />
      <BlogPage
        initialPosts={posts}
        activeCategory={activeCategory}
        activeSearch={activeSearch}
        initialStatus={initialStatus}
        sidebarData={sidebarData}
      />
    </>
  );
}
