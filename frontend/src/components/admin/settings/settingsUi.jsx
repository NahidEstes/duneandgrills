"use client";

export const settingsCardClass = "rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.045] to-white/[0.018] p-5 sm:p-6";
export const settingsInputClass = "h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-neutral-700 focus:border-dune-amber/60";

export const SettingsCard = ({ icon: Icon, title, description, children }) => (
  <section className={settingsCardClass}>
    <div className="flex items-start gap-3 border-b border-white/[0.07] pb-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-dune-amber/10 text-dune-amber"><Icon className="h-5 w-5" /></span>
      <div><h2 className="font-body text-base font-semibold text-white">{title}</h2><p className="mt-1 text-xs leading-5 text-neutral-500">{description}</p></div>
    </div>
    <div className="mt-5">{children}</div>
  </section>
);

export const Field = ({ label, hint, children }) => (
  <label className="block text-xs font-medium text-neutral-400">
    <span>{label}</span>
    {children}
    {hint && <span className="mt-1.5 block text-[0.68rem] font-normal leading-4 text-neutral-600">{hint}</span>}
  </label>
);

export const Toggle = ({ checked, onChange, label, description, disabled = false }) => (
  <label className={`flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-black/20 p-3 ${disabled ? "opacity-50" : ""}`}>
    <span><span className="block text-sm font-medium text-neutral-200">{label}</span>{description && <span className="mt-0.5 block text-[0.68rem] leading-4 text-neutral-600">{description}</span>}</span>
    <input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
    <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full bg-neutral-800 transition peer-checked:bg-dune-amber peer-focus-visible:ring-2 peer-focus-visible:ring-dune-amber/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-neutral-400 after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-black" />
  </label>
);
