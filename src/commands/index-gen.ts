import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBundle, type Bundle } from '../core/bundle.ts';
import { conceptTitle, type Concept } from '../core/concept.ts';
import { conceptStatus } from '../core/lifecycle.ts';
import { dim, green, red } from '../core/term.ts';

export interface IndexOptions {
  bundle: string;
  check?: boolean;
  rootOnly?: boolean;
  includeDeprecated?: boolean;
}

export function runIndex(options: IndexOptions): number {
  const bundle = loadBundle(options.bundle);
  const targets = options.rootOnly ? [''] : directories(bundle);

  let drifted = 0;
  let written = 0;

  for (const dir of targets) {
    const generated = renderIndex(bundle, dir, options.includeDeprecated === true);
    if (generated === null) continue;

    const file = join(bundle.root, dir, 'index.md');
    const rel = dir ? `${dir}/index.md` : 'index.md';
    const current = existsSync(file) ? readFileSync(file, 'utf8') : null;

    if (current === generated) continue;

    if (options.check) {
      drifted++;
      console.log(`${red('drift')} ${rel} ${dim(current === null ? '(missing)' : '(out of date)')}`);
      continue;
    }

    writeFileSync(file, generated);
    written++;
    console.log(`${green(current === null ? 'create' : 'update')} ${rel}`);
  }

  if (options.check) {
    if (drifted > 0) {
      console.log(`\n${red(`${drifted} index file${drifted === 1 ? '' : 's'} out of date`)}`);
      console.log(dim('run `okfctl index` to regenerate'));
      return 1;
    }
    console.log(green('all index.md files up to date'));
    return 0;
  }

  console.log(written === 0 ? dim('nothing to do') : `\n${written} file${written === 1 ? '' : 's'} written`);
  return 0;
}

/** Every directory holding at least one concept, plus their ancestors. */
function directories(bundle: Bundle): string[] {
  const dirs = new Set<string>(['']);
  for (const concept of bundle.concepts) {
    const parts = concept.id.split('/').slice(0, -1);
    for (let depth = 1; depth <= parts.length; depth++) {
      dirs.add(parts.slice(0, depth).join('/'));
    }
  }
  return [...dirs].sort();
}

/**
 * SPEC 8: sections of `* [Title](url) - description`, no frontmatter, except
 * that a bundle-root index.md may carry `okf_version` (SPEC 12) — which we
 * carry across rather than dropping.
 */
function renderIndex(bundle: Bundle, dir: string, includeDeprecated: boolean): string | null {
  const prefix = dir ? `${dir}/` : '';

  const here = bundle.concepts.filter((concept) => {
    if (!concept.id.startsWith(prefix)) return false;
    if (concept.id.slice(prefix.length).includes('/')) return false;
    return includeDeprecated || conceptStatus(concept.data) !== 'deprecated';
  });

  const children = new Set<string>();
  for (const concept of bundle.concepts) {
    if (!concept.id.startsWith(prefix)) continue;
    const rest = concept.id.slice(prefix.length);
    if (rest.includes('/')) children.add(rest.split('/')[0]);
  }

  if (here.length === 0 && children.size === 0) return null;

  const sections = new Map<string, Concept[]>();
  for (const concept of here) {
    const type = typeof concept.data.type === 'string' && concept.data.type.trim()
      ? concept.data.type.trim()
      : 'Concepts';
    const list = sections.get(type) ?? [];
    list.push(concept);
    sections.set(type, list);
  }

  const parts: string[] = [];
  const preserved = dir === '' ? rootFrontmatter(bundle.root) : null;
  if (preserved) parts.push(preserved);

  for (const type of [...sections.keys()].sort()) {
    const lines = [`# ${pluralize(type)}`, ''];
    for (const concept of sections.get(type)!) {
      const name = `${concept.id.slice(prefix.length)}.md`;
      lines.push(`* [${conceptTitle(concept)}](${name})${describe(concept)}`);
    }
    parts.push(lines.join('\n'));
  }

  if (children.size > 0) {
    const lines = ['# Subdirectories', ''];
    for (const child of [...children].sort()) lines.push(`* [${child}](${child}/)`);
    parts.push(lines.join('\n'));
  }

  return `${parts.join('\n\n')}\n`;
}

function describe(concept: Concept): string {
  const description = concept.data.description;
  if (typeof description !== 'string' || !description.trim()) return '';
  return ` - ${description.trim()}`;
}

function rootFrontmatter(root: string): string | null {
  const file = join(root, 'index.md');
  if (!existsSync(file)) return null;
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8'));
  if (!match) return null;
  const version = /^okf_version:.*$/m.exec(match[1]);
  return version ? `---\n${version[0]}\n---` : null;
}

function pluralize(type: string): string {
  if (/(s|x|z|ch|sh)$/i.test(type)) return `${type}es`;
  if (/[^aeiou]y$/i.test(type)) return `${type.slice(0, -1)}ies`;
  return `${type}s`;
}
