"use client";

import { Moon, Sun } from "lucide-react";
import { useWorkspaceTheme } from "../../context/WorkspaceThemeContext.jsx";

export default function WorkspaceThemeToggle() {
  const { theme, toggleTheme, storageError } = useWorkspaceTheme();
  const light = theme === "light";
  return <span className="relative inline-flex shrink-0" data-draft-ignore>
    <button type="button" role="switch" aria-label="Light mode" aria-checked={light} onClick={toggleTheme} title={light ? "Switch to Dark Mode" : "Switch to Light Mode"} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 text-neutral-300 hover:bg-white/5 hover:text-dune-amber">
      {light ? <Moon aria-hidden="true" className="h-4 w-4"/> : <Sun aria-hidden="true" className="h-4 w-4"/>}
    </button>
    {storageError && <span role="status" className="sr-only">{storageError}</span>}
  </span>;
}
