"use client";

/**
 * Last-resort error page, shown when the root layout itself fails. It
 * replaces the whole document, so it cannot rely on global styles or the
 * theme: it uses inline styles that follow the OS color scheme.
 */
export default function GlobalError({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <title>Something went wrong · Full Court</title>
        <meta name="color-scheme" content="light dark" />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "1rem",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.75rem" }}>Something went wrong</h1>
          <p>Full Court hit an unexpected error. Please try again.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              minHeight: "44px",
              padding: "0 1.25rem",
              borderRadius: "10px",
              border: "none",
              background: "#c2410c",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
