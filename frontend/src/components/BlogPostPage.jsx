"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Navbar from "./Navbar.jsx";
import Footer from "./Footer.jsx";
import CartDrawer from "./CartDrawer.jsx";
import BlogSidebar from "./BlogSidebar.jsx";
import SmartImage from "./SmartImage.jsx";

const BlogPostPage = ({ post, slug, sidebarData }) => {
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <div className="bg-black min-h-screen">
      <Navbar onCartClick={() => setCartOpen(true)} />

      <div className="max-w-7xl mx-auto px-5 md:px-8 pt-28 pb-20 md:pb-28 grid lg:grid-cols-3 gap-10">
        {/* Main article column */}
        <div className="lg:col-span-2">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-neutral-400 hover:text-white text-sm mb-8"
          >
            <ArrowLeft className="w-4 h-4" /> Back to blog
          </Link>

          {post && (
            <article>
              <span className="eyebrow">{post.category}</span>
              <h1 className="mt-3 text-3xl md:text-5xl text-white leading-tight">
                {post.title}
              </h1>
              <p className="mt-4 text-sm text-neutral-500">
                By {post.author} ·{" "}
                {new Date(post.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>

              <div className="mt-8 rounded-2xl overflow-hidden border border-dune-border">
                <SmartImage
                  src={post.coverImage}
                  alt={post.title}
                  width={1200}
                  height={768}
                  sizes="(min-width: 1024px) 66vw, 100vw"
                  className="w-full h-72 md:h-96 object-cover"
                />
              </div>

              <div className="mt-8 text-neutral-300 leading-relaxed whitespace-pre-line">
                {post.content}
              </div>

              {post.tags?.length > 0 && (
                <div className="mt-10 flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs text-neutral-400 border border-dune-border rounded-full px-3 py-1"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </article>
          )}
        </div>

        {/* Sidebar */}
        <div>
          <BlogSidebar currentSlug={slug} initialData={sidebarData} />
        </div>
      </div>

      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default BlogPostPage;
