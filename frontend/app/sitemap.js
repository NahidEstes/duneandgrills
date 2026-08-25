import { getBlogPosts } from "@/src/api/server.js";

const baseUrl = "https://duneandgrills.com";

export const dynamic = "force-dynamic";

export default async function sitemap() {
  const posts = await getBlogPosts().catch(() => []);

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/menu`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...posts.map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: post.updatedAt || post.createdAt,
      changeFrequency: "monthly",
      priority: 0.7,
    })),
  ];
}
