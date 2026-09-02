import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ScriptFileStore } from '../../src/storage/scriptFileStore';

suite('ScriptFileStore', () => {
  let dir: string;
  let filePath: string;

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssx-store-'));
    filePath = path.join(dir, 'scripts.json');
  });

  teardown(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('檔案不存在時載入為空清單', () => {
    const store = new ScriptFileStore(filePath);
    store.load();
    assert.deepEqual(store.getState(), { version: 1, roots: [] });
    store.dispose();
  });

  test('update → flush 落檔，重新載入 round-trip', async () => {
    const store = new ScriptFileStore(filePath);
    store.load();
    assert.ok(
      store.update((state) => {
        state.roots.push({ kind: 'script', id: 's1', label: 'a', path: '~/a.sh', note: '備註' });
        return true;
      }),
    );
    await store.flush();
    store.dispose();
    assert.ok(fs.existsSync(filePath));
    assert.ok(!fs.existsSync(`${filePath}.tmp`), 'tmp 檔應已 rename 掉');

    const reloaded = new ScriptFileStore(filePath);
    reloaded.load();
    assert.deepEqual(reloaded.getState().roots, [
      { kind: 'script', id: 's1', label: 'a', path: '~/a.sh', note: '備註' },
    ]);
    reloaded.dispose();
  });

  test('mutator 回傳 false 時不寫檔也不發事件', async () => {
    const store = new ScriptFileStore(filePath);
    store.load();
    let changed = 0;
    store.onDidChange(() => changed++);
    assert.equal(store.update(() => false), false);
    await store.flush();
    assert.equal(changed, 0);
    assert.equal(fs.existsSync(filePath), false);
    store.dispose();
  });

  test('checkDisk 偵測外部改檔並發 onDidChange', async () => {
    const store = new ScriptFileStore(filePath);
    store.load();
    store.update((state) => {
      state.roots.push({ kind: 'script', id: 's1', label: 'a', path: '~/a.sh' });
      return true;
    });
    await store.flush();

    // 模擬外部（另一台機器經 Dropbox）改寫，往前調 mtime 確保與自寫紀錄可區分
    const external = { version: 1, roots: [{ kind: 'script', id: 's2', label: 'b', path: '~/b.sh' }] };
    fs.writeFileSync(filePath, JSON.stringify(external));
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(filePath, future, future);

    let changed = 0;
    store.onDidChange(() => changed++);
    store.checkDisk();
    assert.equal(changed, 1);
    assert.equal(store.getState().roots[0]?.id, 's2');
    store.dispose();
  });

  test('checkDisk 自寫守衛：flush 後未變動不觸發', async () => {
    const store = new ScriptFileStore(filePath);
    store.load();
    store.update((state) => {
      state.roots.push({ kind: 'script', id: 's1', label: 'a', path: '~/a.sh' });
      return true;
    });
    await store.flush();
    let changed = 0;
    store.onDidChange(() => changed++);
    store.checkDisk();
    assert.equal(changed, 0);
    store.dispose();
  });

  test('壞 JSON：改名保留原檔、發 onError、以空清單啟動', () => {
    fs.writeFileSync(filePath, '{not json');
    const store = new ScriptFileStore(filePath);
    const errors: string[] = [];
    store.onError((m) => errors.push(m));
    store.load();
    assert.deepEqual(store.getState(), { version: 1, roots: [] });
    assert.equal(errors.length, 1);
    assert.equal(fs.existsSync(filePath), false);
    const backups = fs.readdirSync(dir).filter((f) => f.startsWith('scripts.json.corrupt-'));
    assert.equal(backups.length, 1);
    store.dispose();
  });
});
