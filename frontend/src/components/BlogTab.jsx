"use client";

import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  fetchAllBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  fetchManagedCategories,
} from "../api/api.js";
import SmartImage from "./SmartImage.jsx";
import { confirmDelete } from "./admin/deleteToast.js";

const EMPTY_FORM = {
  title: "",
  excerpt: "",
  content: "",
  coverImage: "",
  categoryId: "",
  author: "Dune & Grills Team",
  tags: "",
  isPublished: true,
};

const BlogTab = ({ onDataChanged }) => {
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadPosts = async () => {
    setLoading(true);
    try {
      const [nextPosts, nextCategories] = await Promise.all([
        fetchAllBlogPosts(),
        fetchManagedCategories("blog"),
      ]);
      setPosts(nextPosts);
      setCategories(nextCategories);
    } catch (err) {
      setError("Failed to load blog posts.");
      toast.error(err.response?.data?.message || "Unable to load blog posts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const openAddForm = () => {
    setForm({
      ...EMPTY_FORM,
      categoryId: categories.find((entry) => entry.isActive)?._id || "",
    });
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (post) => {
    setForm({
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      coverImage: post.coverImage,
      categoryId:
        post.categoryRef?._id ||
        post.categoryRef ||
        categories.find((entry) => entry.name === post.category)?._id ||
        "",
      author: post.author,
      tags: (post.tags || []).join(", "),
      isPublished: post.isPublished,
    });
    setEditingId(post._id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      ...form,
      tags: form.tags
        ? form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    };

    try {
      if (editingId) {
        await updateBlogPost(editingId, payload);
        toast.success("Article updated successfully.");
      } else {
        await createBlogPost(payload);
        toast.success("Article published successfully.");
      }
      setShowForm(false);
      await loadPosts();
      onDataChanged?.();
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Save failed. Check that all required fields are filled.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, title) => {
    confirmDelete({
      title: `Delete “${title}”?`,
      description: "The article will be removed from the public blog.",
      onConfirm: async () => {
        await deleteBlogPost(id);
        setPosts((prev) => prev.filter((post) => post._id !== id));
        onDataChanged?.();
      },
      successMessage: "Article deleted.",
      errorMessage: "Unable to delete article.",
    });
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={openAddForm}
          className="inline-flex items-center gap-2 bg-dune-amber hover:bg-dune-amberLight text-black font-semibold px-4 py-2 rounded-full text-sm"
        >
          <Plus className="w-4 h-4" /> New Article
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-neutral-500">Loading articles...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-dune-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dune-border text-left text-neutral-400">
                <th className="p-4">Cover</th>
                <th className="p-4">Title</th>
                <th className="p-4">Category</th>
                <th className="p-4">Status</th>
                <th className="p-4">Published</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr
                  key={post._id}
                  className="border-b border-dune-border last:border-0"
                >
                  <td className="p-4">
                    <SmartImage
                      src={post.coverImage}
                      alt={post.title}
                      width={96}
                      height={96}
                      sizes="48px"
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                  </td>
                  <td className="p-4 text-white font-medium max-w-xs truncate">
                    {post.title}
                  </td>
                  <td className="p-4">{post.category}</td>
                  <td className="p-4">
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                        post.isPublished
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40"
                          : "bg-neutral-500/10 text-neutral-400 border-neutral-500/40"
                      }`}
                    >
                      {post.isPublished ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td className="p-4 text-neutral-400 text-xs">
                    {new Date(post.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEditForm(post)}
                        className="w-8 h-8 flex items-center justify-center rounded-full border border-dune-border hover:border-dune-amber text-white"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(post._id, post.title)}
                        className="w-8 h-8 flex items-center justify-center rounded-full border border-dune-border hover:border-red-400 text-white"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {posts.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-500">
                    No articles yet. Click &quot;New Article&quot; to write one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div
          onClick={() => setShowForm(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            className="w-full max-w-xl rounded-2xl border border-dune-border bg-dune-surface p-6 my-8"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-semibold text-white">
                {editingId ? "Edit Article" : "New Article"}
              </h2>
              <button type="button" onClick={() => setShowForm(false)}>
                <X className="w-5 h-5 text-neutral-400 hover:text-white" />
              </button>
            </div>

            <div className="space-y-4">
              <input
                required
                placeholder="Title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none"
              />
              <textarea
                required
                rows={2}
                placeholder="Short excerpt (shown on the blog listing card)"
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none resize-none"
              />
              <textarea
                required
                rows={8}
                placeholder="Full article content"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none resize-none"
              />
              <input
                required
                placeholder="Cover Image URL"
                value={form.coverImage}
                onChange={(e) =>
                  setForm({ ...form, coverImage: e.target.value })
                }
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none"
              />
              <div className="grid grid-cols-2 gap-4">
                <select
                  required
                  value={form.categoryId}
                  onChange={(e) =>
                    setForm({ ...form, categoryId: e.target.value })
                  }
                  className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none"
                >
                  <option value="" disabled>Select a category</option>
                  {categories
                    .filter((entry) => entry.isActive || entry._id === form.categoryId)
                    .map((entry) => (
                      <option key={entry._id} value={entry._id}>
                        {entry.name}{entry.isActive ? "" : " (Inactive)"}
                      </option>
                    ))}
                </select>
                <input
                  placeholder="Author"
                  value={form.author}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                  className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none"
                />
              </div>
              <input
                placeholder="Tags (comma separated, e.g. grilling, tips)"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                className="w-full rounded-lg bg-black border border-dune-border px-4 py-2.5 text-white focus:border-dune-amber outline-none"
              />
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={form.isPublished}
                  onChange={(e) =>
                    setForm({ ...form, isPublished: e.target.checked })
                  }
                  className="w-4 h-4 accent-amber-600"
                />
                Published (visible to visitors)
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full mt-6 bg-dune-amber hover:bg-dune-amberLight disabled:opacity-60 text-black font-semibold py-3 rounded-full"
            >
              {saving
                ? "Saving..."
                : editingId
                ? "Update Article"
                : "Publish Article"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default BlogTab;
