import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { CATALOG, loadBundle, type Bundle } from '../core/bundle.ts';
import {
  conceptTitle,
  createConcept,
  parseConcept,
  serializeConcept,
  type Concept,
} from '../core/concept.ts';
import { conceptStatus, isDrifted, trustTier } from '../core/lifecycle.ts';
import { byTitle, describe, groupByType, pluralize } from '../core/render.ts';
import { dim, green, red } from '../core/term.ts';

export interface CatalogOptions {
  bundle: string;
  write?: boolean;
  out?: string;
  check?: boolean;
  includeDeprecated?: boolean;
}

/**
 * SPEC §11 requires a non-empty `type` and forbids rejecting an unknown one
 * (SPEC §4.1), so a written catalog is a conformant concept to any other
 * consumer. `Index` is okfctl's convention, not a value the spec names.
 */
const CATALOG_TYPE = 'Index';
const CATALOG_TITLE = 'Catalog';
const CATALOG_DESCRIPTION = 'Every concept in this bundle, grouped by type.';
const PRODUCER = 'okfctl/0.1.0';

export function runCatalog(options: CatalogOptions): number {
  const bundle = loadBundle(options.bundle);
  const body = renderCatalog(bundle, options.includeDeprecated === true);

  if (!options.check && !options.write && options.out === undefined) {
    process.stdout.write(body);
    return 0;
  }

  let target: { rel: string; file: string };
  try {
    target = resolveTarget(bundle.root, options.out);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  const current = existsSync(target.file)
    ? parseConcept(target.file, target.rel, readFileSync(target.file, 'utf8'))
    : null;

  if (options.check) {
    if (current === null) {
      console.log(`${red('drift')} ${target.rel} ${dim('(missing)')}`);
      console.log(dim('run `okfctl catalog --write` to generate it'));
      return 1;
    }
    if (current.body !== body) {
      console.log(`${red('drift')} ${target.rel} ${dim('(out of date)')}`);
      console.log(dim('run `okfctl catalog --write` to regenerate'));
      return 1;
    }
    console.log(green(`${target.rel} up to date`));
    return 0;
  }

  if (current && current.body === body) {
    console.log(dim(`${target.rel} unchanged`));
    return 0;
  }

  mkdirSync(dirname(target.file), { recursive: true });
  writeFileSync(target.file, serializeConcept(catalogConcept(target, body, current)));
  console.log(`${green(current === null ? 'create' : 'update')} ${target.rel}`);
  return 0;
}

/**
 * The whole bundle in one document, grouped by `type` rather than by
 * directory, so a Decision filed under `guides/` sits with the rest of them.
 */
export function renderCatalog(bundle: Bundle, includeDeprecated: boolean): string {
  const listed = bundle.concepts
    .filter((concept) => includeDeprecated || conceptStatus(concept.data) !== 'deprecated')
    .sort(byTitle);

  const parts = [`# ${CATALOG_TITLE}`];
  for (const [type, concepts] of groupByType(listed)) {
    const lines = [`# ${pluralize(type)}`, ''];
    for (const concept of concepts) {
      const link = `* [${conceptTitle(concept)}](${concept.id}.md)`;
      lines.push(`${link}${markers(concept)}${describe(concept)}`);
    }
    parts.push(lines.join('\n'));
  }
  return `${parts.join('\n\n')}\n`;
}

/**
 * What the reader needs to know before trusting an entry. Every marker is a
 * function of frontmatter alone — staleness is deliberately absent, because it
 * is a function of today and would drift a checked-in catalog on a morning when
 * nothing changed. `okfctl status --stale` answers that one.
 */
function markers(concept: Concept): string {
  const found: string[] = [];
  const status = conceptStatus(concept.data);
  if (status !== 'stable') found.push(status);
  if (trustTier(concept.data) === 'unverified') found.push('unverified');
  if (isDrifted(concept.data)) found.push('drifted');
  return found.length > 0 ? ` [${found.join(', ')}]` : '';
}

function resolveTarget(root: string, out: string | undefined): { rel: string; file: string } {
  if (out === undefined) return { rel: CATALOG, file: join(root, CATALOG) };

  const file = isAbsolute(out) ? resolve(out) : resolve(root, out);
  const rel = relative(root, file).split(sep).join('/');
  if (rel.startsWith('..')) throw new Error(`--out must stay inside the bundle: ${out}`);
  if (!rel.endsWith('.md')) throw new Error(`--out must name a .md file: ${out}`);
  return { rel, file };
}

/**
 * Frontmatter for the file we write. `generated.at` carries across whenever the
 * body is unchanged, for the same reason the root index carries `okf_version`
 * across: a value that moves on every run would fail `--check` the next day and
 * tell the caller nothing.
 */
function catalogConcept(
  target: { rel: string; file: string },
  body: string,
  current: Concept | null,
): Concept {
  const generated = current?.data.generated as Record<string, unknown> | undefined;
  const at = typeof generated?.at === 'string' && current?.body === body
    ? generated.at
    : new Date().toISOString();

  return createConcept(
    target.file,
    target.rel.replace(/\.md$/, ''),
    [
      ['type', CATALOG_TYPE],
      ['title', CATALOG_TITLE],
      ['description', CATALOG_DESCRIPTION],
      ['generated', { by: PRODUCER, at }],
    ],
    body,
  );
}
