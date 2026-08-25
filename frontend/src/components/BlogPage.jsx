"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Navbar from "./Navbar.jsx";
import Footer from "./Footer.jsx";
import CartDrawer from "./CartDrawer.jsx";
import BlogSidebar from "./BlogSidebar.jsx";
import SmartImage from "./SmartImage.jsx";

const CATEGORIES = [
  "All",
  "Recipes",
  "Behind the Scenes",
  "Nutrition",
  "News",
  "Tips",
];

const BlogPage = ({
  initialPosts = [],
  activeCategory = "All",
  activeSearch = "",
  initialStatus = "success",
  sidebarData,
}) => {
  const [cartOpen, setCartOpen] = useState(false);
  const router = useRouter();
  const posts = initialPosts;
  const status = initialStatus;

  const navigateWithFilters = (category, search) => {
    const params = new URLSearchParams();
    if (category && category !== "All") params.set("category", category);
    if (search) params.set("search", search);
    const query = params.toString();
    router.push(query ? `/blog?${query}` : "/blog");
  };

  const handleCategoryChange = (cat) => {
    navigateWithFilters(cat, activeSearch);
  };

  const handleSearch = (term) => {
    navigateWithFilters(activeCategory, term);
  };

  return (
    <div className="bg-black min-h-screen">
      <Navbar onCartClick={() => setCartOpen(true)} />

      <div className="max-w-7xl mx-auto px-5 md:px-8 pt-28 pb-20 md:pb-28 grid lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-neutral-400 hover:text-white text-sm mb-8"
          >
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>

          <div className="max-w-2xl">
            <p className="eyebrow">The Journal</p>
            <h1 className="mt-3 text-4xl md:text-5xl text-white">
              STORIES FROM THE{" "}
              <span className="text-gradient-amber">GRILL.</span>
            </h1>
            <p className="mt-4 text-neutral-400">
              Recipes, kitchen stories, and everything we&apos;ve learned about
              fire and flavor.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                className={`px-5 py-2 rounded-full text-sm font-medium border transition-colors duration-300 ${
                  activeCategory === cat
                    ? "bg-dune-amber text-black border-dune-amber"
                    : "border-dune-border text-neutral-300 hover:border-dune-amber hover:text-dune-amber"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {activeSearch && (
            <p className="mt-4 text-sm text-neutral-500">
              Showing results for &quot;{activeSearch}&quot;
            </p>
          )}

          <div className="mt-8">
            {status === "loading" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-80 rounded-2xl border border-dune-border bg-dune-surface animate-pulse"
                  />
                ))}
              </div>
            )}

            {status === "error" && (
              <div className="text-center py-16 border border-dune-border rounded-2xl">
                <p className="text-neutral-400">
                  We couldn&apos;t load the blog right now.
                </p>
              </div>
            )}

            {status === "success" && posts.length === 0 && (
              <div className="text-center py-16 border border-dune-border rounded-2xl">
                <p className="text-neutral-400">No articles found.</p>
              </div>
            )}

            {status === "success" && posts.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {posts.map((post) => (
                  <Link
                    key={post._id}
                    href={`/blog/${post.slug}`}
                    className="group rounded-2xl border border-dune-border bg-dune-surface overflow-hidden hover:border-dune-amber/60 hover:-translate-y-1 transition-all duration-300"
                  >
                    <div className="h-48 overflow-hidden">
                      <SmartImage
                        src={post.coverImage}
                        alt={post.title}
                        width={700}
                        height={400}
                        sizes="(min-width: 1024px) 32vw, (min-width: 640px) 50vw, 100vw"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      />
                    </div>
                    <div className="p-5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-dune-amber">
                        {post.category}
                      </span>
                      <h3 className="mt-2 text-lg font-semibold text-white leading-snug">
                        {post.title}
                      </h3>
                      <p className="mt-2 text-sm text-neutral-400 line-clamp-2">
                        {post.excerpt}
                      </p>
                      <span className="mt-4 inline-flex items-center gap-1.5 text-sm text-dune-amber">
                        Read more <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <BlogSidebar onSearch={handleSearch} initialData={sidebarData} />
        </div>
      </div>

      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default BlogPage;
