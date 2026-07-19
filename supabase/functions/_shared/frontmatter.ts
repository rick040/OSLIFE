/**
 * Minimal YAML-frontmatter renderer for the vault (see materialize-note).
 * Deliberately tiny — this only ever needs to emit the handful of scalar/array
 * property shapes OSLIFE's own notes use, not general-purpose YAML. Null/
 * undefined/empty-array values are omitted entirely rather than emitted as
 * `null`, so files stay close to how a human would actually write frontmatter.
 */

export type FrontmatterValue = string | number | boolean | string[] | null | undefined;
export type Frontmatter = Record<string, FrontmatterValue>;

function scalar(v: string | number | boolean): string {
  if (typeof v !== "string") return String(v);
  // Quote anything that would otherwise confuse a YAML parser (colons, quotes,
  // leading/trailing whitespace, or a value that merely looks numeric/boolean).
  const needsQuoting = /[:#'"[\]{}]|^\s|\s$|^$/.test(v) || /^(true|false|null|\d)/i.test(v);
  return needsQuoting ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v;
}

function render(fm: Frontmatter): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(fm)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      lines.push(`${key}: [${value.map((v) => scalar(v)).join(", ")}]`);
    } else {
      lines.push(`${key}: ${scalar(value)}`);
    }
  }
  return lines.join("\n");
}

/** Render a full note: `---\nfrontmatter\n---\n\nbody`. */
export function renderNote(frontmatter: Frontmatter, body: string): string {
  return `---\n${render(frontmatter)}\n---\n\n${body.trim()}\n`;
}
