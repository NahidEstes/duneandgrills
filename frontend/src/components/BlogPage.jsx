import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Navbar from "./Navbar.jsx";
import Footer from "./Footer.jsx";
import CartDrawer from "./CartDrawer.jsx";
import BlogSidebar from "./BlogSidebar.jsx";
import { fetchBlogPosts } from "../api/api.js";

const CATEGORIES = [
  "All",
  "Recipes",
  "Behind the Scenes",
  "Nutrition",
  "News",
  "Tips",
];

const BlogPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get("category") || "All";
  const activeSearch = searchParams.get("search") || "";

  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState("loading");
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    const params = new URLSearchParams();
    if (activeCategory !== "All") params.set("category", activeCategory);
    if (activeSearch) params.set("search", activeSearch);

    fetchBlogPosts(activeCategory !== "All" ? activeCategory : undefined)
      .then((data) => {
        if (cancelled) return;
        const filtered = activeSearch
          ? data.filter(
              (p) =>
                p.title.toLowerCase().includes(activeSearch.toLowerCase()) ||
                p.excerpt.toLowerCase().includes(activeSearch.toLowerCase())
            )
          : data;
        setPosts(filtered);
        setStatus("success");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [activeCategory, activeSearch]);

  const handleCategoryChange = (cat) => {
    const next = new URLSearchParams(searchParams);
    if (cat === "All") next.delete("category");
    else next.set("category", cat);
    setSearchParams(next);
  };

  const handleSearch = (term) => {
    const next = new URLSearchParams(searchParams);
    if (term) next.set("search", term);
    else next.delete("search");
    setSearchParams(next);
  };

  return (
    <div className="bg-black min-h-screen">
      <Navbar onCartClick={() => setCartOpen(true)} />

      <div className="max-w-7xl mx-auto px-5 md:px-8 pt-28 pb-20 md:pb-28 grid lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2">
          <Link
            to="/"
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
                    to={`/blog/${post.slug}`}
                    className="group rounded-2xl border border-dune-border bg-dune-surface overflow-hidden hover:border-dune-amber/60 hover:-translate-y-1 transition-all duration-300"
                  >
                    <div className="h-48 overflow-hidden">
                      <img
                        src={post.coverImage}
                        alt={post.title}
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
          <BlogSidebar onSearch={handleSearch} />
        </div>
      </div>

      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default BlogPage;
