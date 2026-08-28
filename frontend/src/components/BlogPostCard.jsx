import Link from "next/link";
import { ArrowRight } from "lucide-react";
import SmartImage from "./SmartImage.jsx";

const BlogPostCard = ({ post, compact = false }) => (
  <Link
    href={`/blog/${post.slug}`}
    className="group overflow-hidden rounded-2xl border border-dune-border bg-dune-surface transition-all duration-300 hover:-translate-y-1 hover:border-dune-amber/60"
  >
    <div className={compact ? "h-32 overflow-hidden" : "h-48 overflow-hidden"}>
      <SmartImage
        src={post.coverImage}
        alt={post.title}
        width={700}
        height={400}
        sizes={
          compact
            ? "(min-width: 1024px) 22vw, (min-width: 640px) 33vw, 100vw"
            : "(min-width: 1024px) 32vw, (min-width: 640px) 50vw, 100vw"
        }
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
      />
    </div>
    <div className={compact ? "p-4" : "p-5"}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-dune-amber">
          {post.category}
        </span>
        {compact && (
          <span className="text-[0.68rem] text-neutral-600">
            {new Date(post.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
      </div>
      <h3
        className={`${compact ? "line-clamp-2 text-base" : "text-lg"} mt-2 font-semibold leading-snug text-white`}
      >
        {post.title}
      </h3>
      {!compact && (
        <>
          <p className="mt-2 line-clamp-2 text-sm text-neutral-400">
            {post.excerpt}
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm text-dune-amber">
            Read more <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </>
      )}
    </div>
  </Link>
);

export default BlogPostCard;
