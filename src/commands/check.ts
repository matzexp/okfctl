import { loadBundle } from '../core/bundle.ts';
import { checkBundle, countBy, type Diagnostic } from '../core/check.ts';
import { renderOutput, resolveFormat } from '../core/render.ts';
import { bold, dim, green, red, yellow } from '../core/term.ts';

export interface CheckOptions {
  bundle: string;
  strict?: boolean;
  format?: string;
  json?: boolean;
  quiet?: boolean;
}

export function runCheck(options: CheckOptions): number {
  const bundle = loadBundle(options.bundle);
  const diagnostics = checkBundle(bundle);
  const errors = countBy(diagnostics, 'error');
  const warnings = countBy(diagnostics, 'warn');

  let format;
  try {
    format = resolveFormat(options);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  if (format !== 'table') {
    console.log(renderOutput(
      { root: bundle.root, concepts: bundle.concepts.length, diagnostics },
      format,
    ));
  } else {
    report(diagnostics, options.quiet === true);
    const summary = [
      `${bundle.concepts.length} concept${bundle.concepts.length === 1 ? '' : 's'}`,
      errors > 0 ? red(`${errors} error${errors === 1 ? '' : 's'}`) : green('0 errors'),
      warnings > 0 ? yellow(`${warnings} warning${warnings === 1 ? '' : 's'}`) : dim('0 warnings'),
    ];
    console.log(`\n${summary.join('  |  ')}`);
    if (errors === 0) console.log(dim('conformant with OKF v0.2 (SPEC 11)'));
  }

  if (errors > 0) return 1;
  return options.strict && warnings > 0 ? 1 : 0;
}

function report(diagnostics: Diagnostic[], quiet: boolean): void {
  const shown = quiet ? diagnostics.filter((entry) => entry.level === 'error') : diagnostics;
  const byFile = new Map<string, Diagnostic[]>();
  for (const diagnostic of shown) {
    const list = byFile.get(diagnostic.where) ?? [];
    list.push(diagnostic);
    byFile.set(diagnostic.where, list);
  }

  for (const [file, list] of byFile) {
    console.log(bold(file));
    for (const diagnostic of list) {
      const label = diagnostic.level === 'error' ? red('error') : yellow('warn ');
      console.log(`  ${label} ${diagnostic.message} ${dim('[' + diagnostic.rule + ']')}`);
    }
  }
}
