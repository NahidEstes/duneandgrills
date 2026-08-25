import Link from "next/link";

export const metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="min-h-screen bg-black flex items-center justify-center px-5 text-center">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="mt-3 text-5xl text-white">PAGE NOT FOUND</h1>
        <p className="mt-4 text-neutral-400">
          The page you requested is no longer on the menu.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex bg-dune-amber hover:bg-dune-amberLight text-black font-semibold px-7 py-3 rounded-full transition-colors"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
