/**
 * Before the suite runs: warn if the Docker VM that runs local Supabase keeps
 * different time from this machine. On Windows and macOS the VM's clock drifts
 * and is stepped back into line (after sleep, say), and tests that depend on
 * time then fail at random: the auth service enforces its wait between two
 * emails (`max_frequency`) against its own clock, a login token can look as if
 * it were issued in the future, and so on. The failures say "Too many
 * attempts" or "unexpected", never "the clocks disagree", so say it here.
 *
 * It only warns: the suite is still worth running.
 */
export default async function globalSetup(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return;
  try {
    const sent = Date.now();
    const response = await fetch(`${url}/auth/v1/health`);
    const received = Date.now();
    const header = response.headers.get("date");
    if (!header) return;
    // The Date header is whole seconds, rounded down: allow a second for that.
    const here = (sent + received) / 2;
    const there = Date.parse(header);
    const skew = Math.round((here - there) / 1000);
    if (Math.abs(skew) >= 3) {
      console.warn(
        `\nWARNING: local Supabase's clock is ${Math.abs(skew)}s ${skew > 0 ? "behind" : "ahead of"} this machine. ` +
          "Time-sensitive tests (the auth resend wait, session tokens) can fail at random until the " +
          "Docker VM's clock is corrected (restart Docker Desktop, or on WSL run `wsl --shutdown`).\n",
      );
    }
  } catch {
    // Supabase not reachable: the tests will say so themselves.
  }
}
