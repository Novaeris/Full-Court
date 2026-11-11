import type { Metadata } from "next";
import { colorTokenNames, colors, fontSize } from "@fullcourt/design-tokens";
import {
  Card,
  Cluster,
  Grid,
  Page,
  PageHeader,
  Section,
  Stack,
} from "@/components/layout/primitives";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { Sheet } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export const metadata: Metadata = { title: "Design system" };

type StatLine = {
  name: string;
  pos: string;
  gp: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  fg: string;
};

/** Fictional sample data for the table demo. */
const SAMPLE: readonly StatLine[] = [
  {
    name: "Marcus Hale",
    pos: "PG",
    gp: 52,
    min: 34.1,
    pts: 24.6,
    reb: 4.2,
    ast: 8.9,
    fg: "47.1",
  },
  {
    name: "Dion Okafor",
    pos: "C",
    gp: 50,
    min: 31.8,
    pts: 18.3,
    reb: 11.7,
    ast: 2.1,
    fg: "58.4",
  },
  {
    name: "Theo Lindqvist",
    pos: "SF",
    gp: 53,
    min: 30.2,
    pts: 16.9,
    reb: 5.8,
    ast: 3.4,
    fg: "45.0",
  },
  {
    name: "Ray Castillo",
    pos: "SG",
    gp: 47,
    min: 27.5,
    pts: 13.2,
    reb: 3.1,
    ast: 2.7,
    fg: "43.8",
  },
];

const COLUMNS: readonly Column<StatLine>[] = [
  { key: "name", header: "Player", cell: (r) => r.name },
  {
    key: "pos",
    header: "Position",
    abbr: "Pos",
    priority: 2,
    cell: (r) => r.pos,
  },
  {
    key: "gp",
    header: "Games",
    abbr: "GP",
    priority: 3,
    align: "end",
    cell: (r) => r.gp,
  },
  {
    key: "min",
    header: "Minutes",
    abbr: "MIN",
    priority: 2,
    align: "end",
    cell: (r) => r.min.toFixed(1),
  },
  {
    key: "pts",
    header: "Points",
    abbr: "PTS",
    align: "end",
    cell: (r) => r.pts.toFixed(1),
  },
  {
    key: "reb",
    header: "Rebounds",
    abbr: "REB",
    align: "end",
    cell: (r) => r.reb.toFixed(1),
  },
  {
    key: "ast",
    header: "Assists",
    abbr: "AST",
    priority: 2,
    align: "end",
    cell: (r) => r.ast.toFixed(1),
  },
  {
    key: "fg",
    header: "Field goal %",
    abbr: "FG%",
    priority: 3,
    align: "end",
    cell: (r) => r.fg,
  },
];

/** Literal class names, so Tailwind can see them at build time. */
const TYPE_SCALE: readonly (readonly [keyof typeof fontSize, string])[] = [
  ["5xl", "text-5xl"],
  ["4xl", "text-4xl"],
  ["3xl", "text-3xl"],
  ["2xl", "text-2xl"],
  ["xl", "text-xl"],
  ["lg", "text-lg"],
  ["base", "text-base"],
  ["sm", "text-sm"],
  ["xs", "text-xs"],
];

export default function StyleguidePage() {
  return (
    <Page>
      <PageHeader
        title="Design system"
        description="Tokens and components from @fullcourt/design-tokens. Resize the window to see layouts change form."
        actions={<ThemeToggle />}
      />

      <Section
        title="Color"
        description="Semantic tokens. Swatches follow the current theme; values are listed for both."
      >
        <Grid min="sm" gap="sm">
          {colorTokenNames.map((name) => (
            <div
              key={name}
              className="flex items-center gap-3 rounded-md border border-border bg-surface p-2"
            >
              <span
                className="size-10 shrink-0 rounded-sm border border-border"
                style={{ backgroundColor: `var(--fc-color-${name})` }}
              />
              <span className="min-w-0">
                <span className="block truncate font-mono text-sm font-semibold">
                  {name}
                </span>
                <span className="block font-mono text-xs text-text-muted">
                  {colors.light[name]} / {colors.dark[name]}
                </span>
              </span>
            </div>
          ))}
        </Grid>
      </Section>

      <Section title="Type">
        <Card>
          <Stack gap="sm">
            {TYPE_SCALE.map(([size, className]) => (
              <p key={size} className={`truncate ${className}`}>
                <span className="mr-3 inline-block w-10 font-mono text-xs text-text-muted">
                  {size}
                </span>
                Full Court
                <span className="ml-3 font-mono text-xs text-text-muted">
                  {fontSize[size][0]}/{fontSize[size][1]}px
                </span>
              </p>
            ))}
          </Stack>
        </Card>
      </Section>

      <Section title="Buttons">
        <Cluster>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <ButtonLink href="/about" variant="secondary">
            Link
          </ButtonLink>
        </Cluster>
      </Section>

      <Section
        title="Responsive table"
        description="Phones show key columns with short headers, tablets add more, desktops show all. The player column stays pinned."
      >
        <ResponsiveTable
          caption="Sample player statistics (fictional)"
          columns={COLUMNS}
          rows={SAMPLE}
          rowKey={(r) => r.name}
        />
      </Section>

      <Section title="Win and loss">
        <Cluster gap="md">
          <span className="font-semibold text-win">W 112–104</span>
          <span className="font-semibold text-loss">L 98–101</span>
          <span className="font-semibold text-warning">Injury: day-to-day</span>
          <span className="font-semibold text-danger">Over the cap</span>
        </Cluster>
      </Section>

      <Section title="Sheet">
        <Sheet
          title="Example sheet"
          triggerLabel="Open sheet"
          triggerClassName="inline-flex min-h-touch items-center gap-2 rounded-md border border-border bg-surface px-5 font-semibold hover:bg-surface-muted"
        >
          <p className="text-text-muted">
            Bottom sheet on phones, side panel on larger screens. Escape, the
            close button or a click outside dismisses it.
          </p>
        </Sheet>
      </Section>

      <Section title="Empty state">
        <EmptyState
          icon="trophy"
          title="No leagues yet"
          description="Create your first league to get started."
          action={<Button>Create league</Button>}
        />
      </Section>
    </Page>
  );
}
