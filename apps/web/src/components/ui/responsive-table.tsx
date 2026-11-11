import { useId, type ReactNode } from "react";

/**
 * Data table that adapts to the screen instead of shrinking:
 *
 * - The first column stays pinned while the rest scroll sideways inside the
 *   table (never the page).
 * - Columns carry a priority. Phones show priority 1, tablets add 2,
 *   desktops show everything.
 */
export type Column<Row> = {
  key: string;
  header: string;
  /** Short header for narrow screens, e.g. "PTS". Defaults to `header`. */
  abbr?: string;
  priority?: 1 | 2 | 3;
  align?: "start" | "end";
  cell: (row: Row) => ReactNode;
};

const visibility = {
  1: "",
  2: "hidden tablet:table-cell",
  3: "hidden desktop:table-cell",
} as const;

export function ResponsiveTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
}: {
  caption: string;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
}) {
  const captionId = useId();
  return (
    <div
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-border bg-surface"
    >
      <table className="w-full border-collapse text-sm tablet:text-base">
        <caption id={captionId} className="sr-only">
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-border">
            {columns.map((column, index) => (
              <th
                key={column.key}
                scope="col"
                className={[
                  "px-3 py-2 font-semibold whitespace-nowrap text-text-muted",
                  column.align === "end" ? "text-right" : "text-left",
                  visibility[column.priority ?? 1],
                  index === 0 ? "sticky left-0 z-10 bg-surface" : "",
                ].join(" ")}
              >
                {column.abbr ? (
                  <>
                    <abbr
                      title={column.header}
                      className="no-underline tablet:hidden"
                    >
                      {column.abbr}
                    </abbr>
                    <span className="hidden tablet:inline">
                      {column.header}
                    </span>
                  </>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-border bg-surface last:border-b-0 even:bg-surface-muted"
            >
              {columns.map((column, index) =>
                index === 0 ? (
                  <th
                    key={column.key}
                    scope="row"
                    className="sticky left-0 z-10 bg-inherit px-3 py-2 text-left font-semibold whitespace-nowrap"
                  >
                    {column.cell(row)}
                  </th>
                ) : (
                  <td
                    key={column.key}
                    className={[
                      "px-3 py-2 whitespace-nowrap tabular-nums",
                      column.align === "end" ? "text-right" : "text-left",
                      visibility[column.priority ?? 1],
                    ].join(" ")}
                  >
                    {column.cell(row)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
