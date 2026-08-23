import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { isOutputFormat, renderOutput, resolveFormat } from '../src/core/render.ts';
import { runStatus } from '../src/commands/status.ts';
import { runCheck } from '../src/commands/check.ts';
import { runRefs } from '../src/commands/refs.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/bundle', import.meta.url));

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'okfctl-format-'));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

function captured(run: () => number): { code: number; out: string; err: string } {
  const log = console.log;
  const error = console.error;
  let out = '';
  let err = '';
  console.log = (...args: unknown[]) => {
    out += `${args.join(' ')}\n`;
  };
  console.error = (...args: unknown[]) => {
    err += `${args.join(' ')}\n`;
  };
  try {
    return { code: run(), out, err };
  } finally {
    console.log = log;
    console.error = error;
  }
}

test('isOutputFormat accepts exactly table, json, yaml', () => {
  assert.equal(isOutputFormat('table'), true);
  assert.equal(isOutputFormat('json'), true);
  assert.equal(isOutputFormat('yaml'), true);
  assert.equal(isOutputFormat('xml'), false);
  assert.equal(isOutputFormat(''), false);
});

test('resolveFormat defaults to table', () => {
  assert.equal(resolveFormat({}), 'table');
});

test('resolveFormat treats --json as a permanent alias for --format json', () => {
  assert.equal(resolveFormat({ json: true }), 'json');
});

test('resolveFormat: --format wins when both are given', () => {
  assert.equal(resolveFormat({ json: true, format: 'yaml' }), 'yaml');
  assert.equal(resolveFormat({ json: true, format: 'table' }), 'table');
});

test('resolveFormat refuses an unrecognized value', () => {
  assert.throws(() => resolveFormat({ format: 'xml' }), /invalid --format "xml"/);
});

test('renderOutput: json is JSON.stringify with two-space indent', () => {
  const data = { a: 1, b: [1, 2] };
  assert.equal(renderOutput(data, 'json'), JSON.stringify(data, null, 2));
});

test('renderOutput: yaml round-trips the same data', () => {
  const data = { a: 1, b: ['x', 'y'], c: { d: true } };
  const text = renderOutput(data, 'yaml');
  assert.deepEqual(parseYaml(text), data);
});

test('status --format json matches --json byte for byte', () => {
  const root = sandbox();
  const viaJson = captured(() => runStatus({ bundle: root, json: true }));
  const viaFormat = captured(() => runStatus({ bundle: root, format: 'json' }));
  assert.equal(viaFormat.out, viaJson.out);
});

test('status --format yaml is parseable and carries the same data as --json', () => {
  const root = sandbox();
  const json = JSON.parse(captured(() => runStatus({ bundle: root, format: 'json' })).out);
  const yamlOut = captured(() => runStatus({ bundle: root, format: 'yaml' })).out;
  assert.deepEqual(parseYaml(yamlOut), json);
});

test('status refuses an invalid --format and writes nothing to stdout', () => {
  const root = sandbox();
  const { code, out, err } = captured(() => runStatus({ bundle: root, format: 'xml' }));
  assert.equal(code, 1);
  assert.equal(out, '');
  assert.match(err, /invalid --format/);
});

test('check --format json matches --json, and --format yaml parses to the same data', () => {
  const root = sandbox();
  const viaJson = captured(() => runCheck({ bundle: root, json: true }));
  const viaFormat = captured(() => runCheck({ bundle: root, format: 'json' }));
  assert.equal(viaFormat.out, viaJson.out);

  const yamlOut = captured(() => runCheck({ bundle: root, format: 'yaml' })).out;
  assert.deepEqual(parseYaml(yamlOut), JSON.parse(viaJson.out));
});

test('check refuses an invalid --format', () => {
  const root = sandbox();
  const { code } = captured(() => runCheck({ bundle: root, format: 'csv' }));
  assert.equal(code, 1);
});

test('refs --format json matches --json, and --format yaml parses to the same data', () => {
  const root = sandbox();
  const viaJson = captured(() => runRefs({ bundle: root, json: true }));
  const viaFormat = captured(() => runRefs({ bundle: root, format: 'json' }));
  assert.equal(viaFormat.out, viaJson.out);

  const yamlOut = captured(() => runRefs({ bundle: root, format: 'yaml' })).out;
  assert.deepEqual(parseYaml(yamlOut), JSON.parse(viaJson.out));
});

test('refs refuses an invalid --format', () => {
  const root = sandbox();
  const { code } = captured(() => runRefs({ bundle: root, format: 'ini' }));
  assert.equal(code, 1);
});

test('table format is untouched: identical output before and after --format exists', () => {
  const root = sandbox();
  const bare = captured(() => runStatus({ bundle: root }));
  const explicitTable = captured(() => runStatus({ bundle: root, format: 'table' }));
  assert.equal(bare.out, explicitTable.out);
});
