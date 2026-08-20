import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { isoDay } from './lifecycle.ts';

/**
 * SPEC §9: a `log.md` may sit at any level. Record an event in the nearest one,
 * walking up from the concept toward the bundle root, and fall back to a
 * root-level log when none exists yet.
 */
export function nearestLog(root: string, conceptFile: string): string {
  let dir = dirname(conceptFile);
  while (true) {
    const candidate = join(dir, 'log.md');
    if (existsSync(candidate)) return candidate;
    if (dir === root || !dir.startsWith(root)) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(root, 'log.md');
}

/**
 * Append a bullet under today's date heading, newest-first. Creates the file
 * and the heading when absent.
 */
export function appendLogEntry(logFile: string, entry: string, today = isoDay()): void {
  const heading = `## ${today}`;
  const bullet = `* ${entry}`;

  if (!existsSync(logFile)) {
    writeFileSync(logFile, `# Directory Update Log\n\n${heading}\n${bullet}\n`);
    return;
  }

  const lines = readFileSync(logFile, 'utf8').replace(/\n+$/, '').split('\n');
  const headingIndex = lines.findIndex((line) => line.trim() === heading);

  if (headingIndex !== -1) {
    // Append after the last bullet already filed under today.
    let insertAt = headingIndex + 1;
    while (insertAt < lines.length && !lines[insertAt].startsWith('## ')) insertAt++;
    while (insertAt > headingIndex + 1 && lines[insertAt - 1].trim() === '') insertAt--;
    lines.splice(insertAt, 0, bullet);
  } else {
    // Newest first: place today's section above the most recent existing one.
    const firstSection = lines.findIndex((line) => line.startsWith('## '));
    const block = [heading, bullet, ''];
    if (firstSection === -1) lines.push('', ...block.slice(0, 2));
    else lines.splice(firstSection, 0, ...block);
  }

  writeFileSync(logFile, `${lines.join('\n').replace(/\n+$/, '')}\n`);
}

export function displayPath(root: string, file: string): string {
  return relative(root, file).split(sep).join('/') || file;
}
