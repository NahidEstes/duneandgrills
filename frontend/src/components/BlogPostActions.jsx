"use client";

import {
  Facebook,
  Heart,
  Link2,
  LoaderCircle,
  MessageCircle,
  Twitter,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  fetchSavedBlogPosts,
  removeSavedBlogPost,
  saveBlogPost,
} from "../api/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import LoginPromptModal from "./LoginPromptModal.jsx";

const BlogPostActions = ({ postId, title, category }) => {
  const { user } = useAuth();
  const router = useRouter();
  const [isSaved, setIsSaved] = useState(false);
  const [checking, setChecking] = useState(Boolean(user));
  const [saving, setSaving] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    let active = true;

    if (!user) {
      setIsSaved(false);
      setChecking(false);
      return undefined;
    }

    setChecking(true);
    fetchSavedBlogPosts()
      .then((posts) => {
        if (active) {
          setIsSaved(posts.some((post) => post._id === postId));
        }
      })
      .catch(() => {
        if (active) toast.error("Unable to check your saved articles.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [postId, user]);

  const updateSavedState = async (nextSaved) => {
    setSaving(true);
    try {
      if (nextSaved) {
        await saveBlogPost(postId);
        toast.success(
          category === "Recipes" ? "Recipe saved." : "Article saved."
        );
      } else {
        await removeSavedBlogPost(postId);
        toast.success(
          category === "Recipes"
            ? "Recipe removed from saved items."
            : "Article removed from saved items."
        );
      }
      setIsSaved(nextSaved);
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to update saved articles."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!user) {
      setShowLogin(true);
      return;
    }
    updateSavedState(!isSaved);
  };

  const getArticleUrl = () => window.location.href.split("#")[0];

  const openShareWindow = (platform) => {
    const articleUrl = getArticleUrl();
    const encodedUrl = encodeURIComponent(articleUrl);
    const encodedTitle = encodeURIComponent(`${title} | Dune & Grills`);
    const destinations = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      whatsapp: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
    };

    window.open(
      destinations[platform],
      "dune-and-grills-share",
      "noopener,noreferrer,width=720,height=560"
    );
  };

  const copyLink = async () => {
    const articleUrl = getArticleUrl();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(articleUrl);
      } else {
        const input = document.createElement("textarea");
        input.value = articleUrl;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("Copy command failed");
      }
      toast.success("Article link copied.");
    } catch {
      toast.error("Unable to copy the article link.");
    }
  };

  const saveLabel = isSaved
    ? "Saved"
    : category === "Recipes"
      ? "Save Recipe"
      : "Save Article";

  return (
    <>
      <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-dune-border bg-dune-surface/80 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="mr-1 text-sm text-neutral-300">Share this article:</span>
          <button
            type="button"
            onClick={() => openShareWindow("facebook")}
            aria-label="Share on Facebook"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white transition-transform hover:scale-105"
          >
            <Facebook className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => openShareWindow("twitter")}
            aria-label="Share on X"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 bg-black text-white transition-transform hover:scale-105"
          >
            <Twitter className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => openShareWindow("whatsapp")}
            aria-label="Share on WhatsApp"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white transition-transform hover:scale-105"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={copyLink}
            aria-label="Copy article link"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-dune-border bg-black text-neutral-300 transition-colors hover:border-dune-amber hover:text-dune-amber"
          >
            <Link2 className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || checking}
          aria-pressed={isSaved}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${
            isSaved
              ? "border-dune-amber bg-dune-amber text-black"
              : "border-dune-amber/60 text-dune-amber hover:bg-dune-amber hover:text-black"
          }`}
        >
          {saving || checking ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Heart className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
          )}
          {checking ? "Checking…" : saving ? "Saving…" : saveLabel}
        </button>
      </div>

      {showLogin && (
        <LoginPromptModal
          message="Log in to save this article to your account."
          onClose={() => setShowLogin(false)}
          onSuccess={async () => {
            setShowLogin(false);
            await updateSavedState(true);
          }}
          onGoRegister={() => {
            setShowLogin(false);
            router.push("/login");
          }}
        />
      )}
    </>
  );
};

export default BlogPostActions;
