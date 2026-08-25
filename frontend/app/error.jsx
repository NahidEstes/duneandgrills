"use client";

export default function GlobalError({ reset }) {
  return (
    <main className="min-h-screen bg-black flex items-center justify-center px-5 text-center">
      <div>
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-3 text-5xl text-white">THE GRILL WENT COLD</h1>
        <p className="mt-4 text-neutral-400">
          Please try loading this page again.
        </p>
        <button
          onClick={reset}
          className="mt-8 bg-dune-amber hover:bg-dune-amberLight text-black font-semibold px-7 py-3 rounded-full transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
