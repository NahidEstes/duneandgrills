import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Navbar from "./Navbar.jsx";
import Footer from "./Footer.jsx";
import CartDrawer from "./CartDrawer.jsx";
import { fetchBlogPostBySlug } from "../api/api.js";

const BlogPostPage = () => {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [status, setStatus] = useState("loading");
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    setStatus("loading");
    fetchBlogPostBySlug(slug)
      .then((data) => {
        setPost(data);
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, [slug]);

  return (
    <div className="bg-black min-h-screen">
      <Navbar onCartClick={() => setCartOpen(true)} />

      <div className="max-w-3xl mx-auto px-5 md:px-8 pt-28 pb-20 md:pb-28">
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 text-neutral-400 hover:text-white text-sm mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Back to blog
        </Link>

        {status === "loading" && (
          <div className="space-y-4">
            <div className="h-8 w-2/3 rounded bg-dune-surface animate-pulse" />
            <div className="h-64 rounded-2xl bg-dune-surface animate-pulse" />
          </div>
        )}

        {status === "error" && (
          <div className="text-center py-16 border border-dune-border rounded-2xl">
            <p className="text-neutral-400">
              This article couldn&apos;t be found.
            </p>
          </div>
        )}

        {status === "success" && post && (
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
              <img
                src={post.coverImage}
                alt={post.title}
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

      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default BlogPostPage;
