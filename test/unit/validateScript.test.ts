import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  hasShellExtension,
  shebangIsShell,
  validateScriptFile,
} from '../../src/core/validate/validateScript';

suite('validateScript', () => {
  let dir: string;

  suiteSetup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssx-validate-'));
  });

  suiteTeardown(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('hasShellExtension：.sh/.bash 不分大小寫', () => {
    assert.ok(hasShellExtension('/a/b.sh'));
    assert.ok(hasShellExtension('/a/B.SH'));
    assert.ok(hasShellExtension('/a/b.bash'));
    assert.equal(hasShellExtension('/a/b.zsh'), false);
    assert.equal(hasShellExtension('/a/deploy'), false);
  });

  test('shebangIsShell：bash/sh 命中，zsh/fish 與無 shebang 不命中', () => {
    assert.ok(shebangIsShell('#!/bin/bash'));
    assert.ok(shebangIsShell('#!/usr/bin/env bash'));
    assert.ok(shebangIsShell('#!/bin/sh'));
    assert.equal(shebangIsShell('#!/bin/zsh'), false);
    assert.equal(shebangIsShell('#!/usr/bin/env fish'), false);
    assert.equal(shebangIsShell('echo hi'), false);
    assert.equal(shebangIsShell(''), false);
  });

  test('副檔名 .sh 即通過（不看內容）', async () => {
    const p = path.join(dir, 'ok.sh');
    fs.writeFileSync(p, 'echo hi\n');
    assert.deepEqual(await validateScriptFile(p), { ok: true });
  });

  test('無副檔名但 shebang 是 bash 通過', async () => {
    const p = path.join(dir, 'deploy');
    fs.writeFileSync(p, '#!/usr/bin/env bash\necho hi\n');
    assert.deepEqual(await validateScriptFile(p), { ok: true });
  });

  test('無副檔名且非 shell shebang 回 not-bash', async () => {
    const p = path.join(dir, 'binary');
    fs.writeFileSync(p, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00]));
    assert.deepEqual(await validateScriptFile(p), { ok: false, reason: 'not-bash' });
  });

  test('不存在回 missing', async () => {
    assert.deepEqual(await validateScriptFile(path.join(dir, 'nope.sh')), {
      ok: false,
      reason: 'missing',
    });
  });

  test('目錄回 not-file', async () => {
    assert.deepEqual(await validateScriptFile(dir), { ok: false, reason: 'not-file' });
  });
});
