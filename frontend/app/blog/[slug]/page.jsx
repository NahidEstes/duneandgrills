import { notFound } from "next/navigation";
import BlogPostPage from "@/src/components/BlogPostPage.jsx";
import JsonLd from "@/src/components/JsonLd.jsx";
import { getBlogPost, getSidebarData } from "@/src/api/server.js";

export const dynamic = "force-dynamic";
export const dynamicParams = true;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await getBlogPost(slug).catch(() => null);

  if (!post) {
    return {
      title: "Article Not Found",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      url: `/blog/${post.slug}`,
      title: post.title,
      description: post.excerpt,
      publishedTime: post.createdAt,
      authors: [post.author],
      tags: post.tags,
      images: [
        {
          url: post.coverImage,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      images: [post.coverImage],
    },
  };
}

export default async function ArticlePage({ params }) {
  const { slug } = await params;
  const post = await getBlogPost(slug).catch(() => null);
  if (!post) notFound();

  const sidebarData = await getSidebarData(slug);
  const articleData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    image: post.coverImage,
    datePublished: post.createdAt,
    dateModified: post.updatedAt || post.createdAt,
    author: { "@type": "Person", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "Dune & Grills",
      logo: {
        "@type": "ImageObject",
        url: "https://duneandgrills.com/logo.jpeg",
      },
    },
    mainEntityOfPage: `https://duneandgrills.com/blog/${post.slug}`,
  };

  return (
    <>
      <JsonLd data={articleData} />
      <BlogPostPage post={post} slug={slug} sidebarData={sidebarData} />
    </>
  );
}
