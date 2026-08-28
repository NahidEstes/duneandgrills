import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock3,
  UserRound,
} from "lucide-react";
import BlogPostActions from "./BlogPostActions.jsx";
import BlogPostCard from "./BlogPostCard.jsx";
import SmartImage from "./SmartImage.jsx";

const BlogArticle = ({ post, readingTime, relatedPosts = [] }) => (
  <>
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 sm:text-sm">
        <li>
          <Link href="/" className="transition-colors hover:text-dune-amber">
            Home
          </Link>
        </li>
        <li aria-hidden="true">
          <ChevronRight className="h-3.5 w-3.5" />
        </li>
        <li>
          <Link
            href="/blog"
            className="transition-colors hover:text-dune-amber"
          >
            Blog
          </Link>
        </li>
        <li aria-hidden="true">
          <ChevronRight className="h-3.5 w-3.5" />
        </li>
        <li>
          <Link
            href={`/blog?category=${encodeURIComponent(post.category)}`}
            className="transition-colors hover:text-dune-amber"
          >
            {post.category}
          </Link>
        </li>
        <li aria-hidden="true">
          <ChevronRight className="h-3.5 w-3.5" />
        </li>
        <li aria-current="page" className="min-w-0 break-words text-dune-amber">
          {post.title}
        </li>
      </ol>
    </nav>

    {/* <Link
      href="/blog"
      className="mb-8 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
    >
      <ArrowLeft className="h-4 w-4" /> Back to blog
    </Link> */}

    <article>
      <span className="eyebrow">{post.category}</span>
      <h1 className="mt-3 text-3xl leading-tight text-white md:text-5xl">
        {post.title}
      </h1>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-500">
        <span className="inline-flex items-center gap-1.5">
          <UserRound className="h-4 w-4 text-dune-amber" /> By {post.author}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-dune-amber" />
          {new Date(post.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-4 w-4 text-dune-amber" /> {readingTime} min read
        </span>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-dune-border">
        <SmartImage
          src={post.coverImage}
          alt={post.title}
          width={1200}
          height={768}
          sizes="(min-width: 1024px) 66vw, 100vw"
          priority
          className="h-72 w-full object-cover md:h-96"
        />
      </div>

      <div className="mt-8 whitespace-pre-line leading-relaxed text-neutral-300">
        {post.content}
      </div>

      {post.tags?.length > 0 && (
        <div className="mt-10 flex flex-wrap gap-2" aria-label="Article tags">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-dune-border px-3 py-1 text-xs text-neutral-400"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <BlogPostActions
        postId={String(post._id)}
        title={post.title}
        category={post.category}
      />
    </article>

    {relatedPosts.length > 0 && (
      <section className="mt-12" aria-labelledby="related-posts-title">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Keep Reading</p>
            <h2
              id="related-posts-title"
              className="mt-2 text-2xl text-white md:text-3xl"
            >
              RELATED POSTS
            </h2>
          </div>
          <Link
            href="/blog"
            className="text-sm text-dune-amber hover:text-dune-amberLight"
          >
            View all
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {relatedPosts.map((relatedPost) => (
            <BlogPostCard
              key={String(relatedPost._id)}
              post={relatedPost}
              compact
            />
          ))}
        </div>
      </section>
    )}
  </>
);

export default BlogArticle;
