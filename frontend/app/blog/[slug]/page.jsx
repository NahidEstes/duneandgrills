import { notFound } from "next/navigation";
import BlogPostPage from "@/src/components/BlogPostPage.jsx";
import BlogArticle from "@/src/components/BlogArticle.jsx";
import JsonLd from "@/src/components/JsonLd.jsx";
import {
  getBlogPost,
  getRelatedBlogPosts,
  getSidebarData,
} from "@/src/api/server.js";
import { calculateReadingTime } from "@/src/utils/readingTime.js";

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

  const [sidebarData, relatedPosts] = await Promise.all([
    getSidebarData(slug),
    getRelatedBlogPosts(slug, 3).catch(() => []),
  ]);
  const readingTime = calculateReadingTime(post.content);
  const canonicalUrl = `https://duneandgrills.com/blog/${post.slug}`;
  const articleData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    image: post.coverImage,
    datePublished: post.createdAt,
    dateModified: post.updatedAt || post.createdAt,
    author: { "@type": "Person", name: post.author },
    articleSection: post.category,
    keywords: post.tags,
    timeRequired: `PT${readingTime}M`,
    publisher: {
      "@type": "Organization",
      name: "Dune & Grills",
      logo: {
        "@type": "ImageObject",
        url: "https://duneandgrills.com/logo.jpeg",
      },
    },
    mainEntityOfPage: canonicalUrl,
  };
  const breadcrumbData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://duneandgrills.com/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: "https://duneandgrills.com/blog",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.category,
        item: `https://duneandgrills.com/blog?category=${encodeURIComponent(post.category)}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: post.title,
        item: canonicalUrl,
      },
    ],
  };

  return (
    <>
      <JsonLd data={articleData} />
      <JsonLd data={breadcrumbData} />
      <BlogPostPage slug={slug} sidebarData={sidebarData}>
        <BlogArticle
          post={post}
          readingTime={readingTime}
          relatedPosts={relatedPosts}
        />
      </BlogPostPage>
    </>
  );
}
