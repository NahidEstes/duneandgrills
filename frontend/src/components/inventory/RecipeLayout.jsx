// Presentation only: workflow state and actions stay with their existing forms.
export function RecipeSectionHeader({ number, title, description, action, level = 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-3">
      {number && <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dune-amber/25 bg-dune-amber/10 text-sm font-semibold text-dune-amber">{number}</span>}
      <div className="min-w-0"><Heading className="font-body text-base font-semibold text-white">{title}</Heading>{description && <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-400">{description}</p>}</div>
    </div>{action && <div className="shrink-0">{action}</div>}
  </div>;
}

export function RecipeActionBar({ children, className = "" }) {
  return <div className={"sticky bottom-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-[#111618] p-3 shadow-lg shadow-black/30 [&>button]:ml-auto [&>div:last-child]:ml-auto sm:bottom-0 sm:p-4 " + className}>{children}</div>;
}
