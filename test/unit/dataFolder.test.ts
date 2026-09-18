import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveDataFolder, revealTarget } from '../../src/storage/dataFolder';

suite('dataFolder', () => {
  let dir: string;

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssx-df-'));
  });

  teardown(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('~/ 開頭的設定值展開到家目錄（含非 ASCII 路徑）', () => {
    const originalHome = process.env.HOME;
    process.env.HOME = dir;
    try {
      const layout = resolveDataFolder('~/Sync/共用腳本/scripts', path.join(dir, 'fallback'));
      const expected = path.join(dir, 'Sync', '共用腳本', 'scripts');
      assert.equal(layout.root, expected);
      assert.equal(layout.scriptsFile, path.join(expected, 'scripts.json'));
      assert.equal(layout.isFallback, false);
      assert.ok(fs.existsSync(path.join(expected, '.shell-scripts.json')));
    } finally {
      process.env.HOME = originalHome;
    }
  });

  test('revealTarget：有 scripts.json 就選取它，讓 Finder 停在資料夾內', () => {
    fs.writeFileSync(path.join(dir, 'scripts.json'), '{}');
    assert.equal(revealTarget(dir), path.join(dir, 'scripts.json'));
  });

  test('revealTarget：*.app 名稱的資料夾也只回傳路徑給 reveal，不會被當成 app 開啟', () => {
    const bundle = path.join(dir, 'Evil.app');
    fs.mkdirSync(bundle);
    assert.equal(revealTarget(bundle), bundle);
    fs.writeFileSync(path.join(bundle, 'scripts.json'), '{}');
    assert.equal(revealTarget(bundle), path.join(bundle, 'scripts.json'));
  });
});
