/** Every public page, with its expected <h1>. Add new pages here. */
export const PAGES = [
  { path: "/", heading: "Own the franchise. Build a dynasty." },
  { path: "/about", heading: "About Full Court" },
  { path: "/privacy", heading: "Privacy Policy" },
  { path: "/terms", heading: "Terms of Service" },
  { path: "/alpha", heading: "Alpha Disclaimer" },
  { path: "/acceptable-use", heading: "Acceptable Use Policy" },
  { path: "/support", heading: "Contact & Support" },
  { path: "/changelog", heading: "Changelog" },
  { path: "/styleguide", heading: "Design system" },
  { path: "/login", heading: "Sign in" },
  { path: "/signup", heading: "Create an account" },
  { path: "/forgot-password", heading: "Reset your password" },
  { path: "/reset-password", heading: "Choose a new password" },
  { path: "/account-deleted", heading: "Your account has been deleted" },
] as const;

/** Pages that need an account; visitors are sent to sign in. */
export const PROTECTED = [
  "/modes",
  "/owner",
  "/career",
  "/dynasty",
  "/leagues",
  "/leagues/new",
  "/account",
] as const;
