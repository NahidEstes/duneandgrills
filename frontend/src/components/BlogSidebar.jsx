"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  ChefHat,
  UtensilsCrossed,
  BookOpen,
  Newspaper,
} from "lucide-react";
import {
  fetchRecentBlogPosts,
  fetchBlogCategoryCounts,
  fetchFeaturedMenuItem,
} from "../api/api.js";
import { formatPrice } from "../utils/currency.js";
import SmartImage from "./SmartImage.jsx";

const CATEGORY_ICONS = {
  Recipes: ChefHat,
  "Behind the Scenes": UtensilsCrossed,
  Nutrition: BookOpen,
  News: Newspaper,
  Tips: ChefHat,
};

// currentSlug: pass the current article's slug (on a post page) to exclude
// it from "Popular Posts" and highlight the right category on the blog list.
const BlogSidebar = ({ currentSlug, onSearch, initialData = {} }) => {
  const [recentPosts, setRecentPosts] = useState(initialData?.recentPosts || []);
  const [categories, setCategories] = useState(initialData?.categories || []);
  const [special, setSpecial] = useState(initialData?.special || null);
  const [searchTerm, setSearchTerm] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (recentPosts.length === 0) {
      fetchRecentBlogPosts(3, currentSlug)
        .then(setRecentPosts)
        .catch(() => {});
    }
    if (categories.length === 0) {
      fetchBlogCategoryCounts()
        .then(setCategories)
        .catch(() => {});
    }
    if (!special) {
      fetchFeaturedMenuItem()
        .then(setSpecial)
        .catch(() => {});
    }
  }, [categories.length, currentSlug, recentPosts.length, special]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchTerm);
    } else {
      router.push(`/blog?search=${encodeURIComponent(searchTerm)}`);
    }
  };

  return (
    <aside className="space-y-6">
      {/* Order CTA */}
      <div className="rounded-2xl border border-dune-border bg-dune-surface overflow-hidden">
        <div className="h-32 overflow-hidden">
          <SmartImage
            src="https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=600&q=80"
            alt="Grilled skewers"
            width={600}
            height={260}
            sizes="(min-width: 1024px) 28vw, 100vw"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="p-5">
          <h3 className="font-display text-lg tracking-wide text-white">
            HUNGRY? ORDER NOW
          </h3>
          <p className="text-sm text-neutral-400 mt-1.5">
            Craving something delicious? Order your favorite dishes fresh and
            fast.
          </p>
          <Link
            href="/menu"
            className="mt-4 inline-flex items-center justify-center w-full bg-dune-amber hover:bg-dune-amberLight text-black font-semibold py-2.5 rounded-full text-sm transition-colors"
          >
            View Menu
          </Link>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="relative">
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search articles"
          className="w-full rounded-full bg-dune-surface border border-dune-border pl-4 pr-11 py-2.5 text-sm text-white focus:border-dune-amber outline-none transition-colors"
        />
        <button
          type="submit"
          aria-label="Search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-dune-amber hover:bg-dune-amberLight text-black"
        >
          <Search className="w-4 h-4" />
        </button>
      </form>

      {/* Popular Posts */}
      {recentPosts.length > 0 && (
        <div className="rounded-2xl border border-dune-border bg-dune-surface p-5">
          <p className="eyebrow mb-4">Popular Posts</p>
          <div className="space-y-4">
            {recentPosts.map((post) => (
              <Link
                key={post._id}
                href={`/blog/${post.slug}`}
                className="flex gap-3 group"
              >
                <SmartImage
                  src={post.coverImage}
                  alt={post.title}
                  width={112}
                  height={112}
                  sizes="56px"
                  className="w-14 h-14 rounded-lg object-cover shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium leading-snug line-clamp-2 group-hover:text-dune-amber transition-colors">
                    {post.title}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">
                    {new Date(post.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <div className="rounded-2xl border border-dune-border bg-dune-surface p-5">
          <p className="eyebrow mb-4">Categories</p>
          <div className="space-y-1">
            {categories.map(({ category, count }) => {
              const Icon = CATEGORY_ICONS[category] || BookOpen;
              return (
                <Link
                  key={category}
                  href={`/blog?category=${encodeURIComponent(category)}`}
                  className="flex items-center justify-between py-2 text-sm text-neutral-300 hover:text-dune-amber transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-dune-amber" />
                    {category}
                  </span>
                  <span className="text-neutral-500">{count}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Today's Special */}
      {special && (
        <div className="rounded-2xl border border-dune-border bg-dune-surface overflow-hidden">
          <div className="h-28 overflow-hidden">
            <SmartImage
              src={special.image}
              alt={special.name}
              width={600}
              height={224}
              sizes="(min-width: 1024px) 28vw, 100vw"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="p-5">
            <p className="eyebrow">Today&apos;s Special</p>
            <h3 className="text-white font-semibold mt-1.5">{special.name}</h3>
            <p className="text-sm text-neutral-400 mt-1.5 line-clamp-2">
              {special.description}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-dune-amber font-display text-lg">
                {formatPrice(special.price)}
              </span>
              <Link
                href="/menu"
                className="text-xs font-semibold bg-dune-amber hover:bg-dune-amberLight text-black px-4 py-2 rounded-full transition-colors"
              >
                Order Now
              </Link>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default BlogSidebar;
