export const workspaceThemeKey = "dg-workspace-theme";
export const normalizeWorkspaceTheme = value => value === "light" ? "light" : "dark";
export const isThemedWorkspace = path => /^\/(admin|inventory)(\/|$)/.test(path || "");

// Runs before paint, under the existing request nonce. No system-theme detection:
// a fresh browser always gets the original dark workspace.
export const workspaceThemeBootstrap = `(()=>{try{if(/^\\/(admin|inventory)(\\/|$)/.test(location.pathname))document.documentElement.dataset.workspaceTheme=localStorage.getItem("${workspaceThemeKey}")==="light"?"light":"dark"}catch{document.documentElement.dataset.workspaceTheme="dark"}})()`;
