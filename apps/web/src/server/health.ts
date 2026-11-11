/** Short build identifier: Render's commit SHA in hosted environments, "dev" locally. */
export function buildVersion(): string {
  return process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "dev";
}
