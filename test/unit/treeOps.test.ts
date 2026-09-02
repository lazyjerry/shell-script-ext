import * as assert from 'node:assert/strict';
import type { FolderNode, ScriptNode, ScriptTreeState } from '../../src/core/model/types';
import {
  addNode,
  allScripts,
  extractNodes,
  findContainer,
  findNode,
  insertNodes,
  moveNodes,
  normalizeState,
  removeNode,
  renameFolder,
  updateScript,
} from '../../src/core/model/treeOps';

function script(id: string): ScriptNode {
  return { kind: 'script', id, label: id, path: `~/bin/${id}.sh` };
}

function folder(id: string, children: (ScriptNode | FolderNode)[] = []): FolderNode {
  return { kind: 'folder', id, name: id, children };
}

/** roots: [a, F(b, G(c)), d] */
function sampleState(): ScriptTreeState {
  return {
    version: 1,
    roots: [script('a'), folder('F', [script('b'), folder('G', [script('c')])]), script('d')],
  };
}

suite('treeOps', () => {
  test('findNode 找得到巢狀節點', () => {
    const state = sampleState();
    assert.equal(findNode(state, 'c')?.id, 'c');
    assert.equal(findNode(state, 'nope'), undefined);
  });

  test('findContainer 回傳包含節點的陣列', () => {
    const state = sampleState();
    const container = findContainer(state, 'c');
    assert.ok(container);
    assert.deepEqual(container.map((n) => n.id), ['c']);
    assert.equal(findContainer(state, 'a'), state.roots);
  });

  test('allScripts 深度優先列出全部 script', () => {
    assert.deepEqual(allScripts(sampleState()).map((s) => s.id), ['a', 'b', 'c', 'd']);
  });

  test('addNode 進 roots 或指定 folder；目標不是 folder 時失敗', () => {
    const state = sampleState();
    assert.ok(addNode(state, script('x')));
    assert.equal(state.roots.at(-1)?.id, 'x');
    assert.ok(addNode(state, script('y'), 'G'));
    const g = findNode(state, 'G') as FolderNode;
    assert.equal(g.children.at(-1)?.id, 'y');
    assert.equal(addNode(state, script('z'), 'a'), false);
  });

  test('removeNode 移除並回傳節點', () => {
    const state = sampleState();
    assert.equal(removeNode(state, 'b')?.id, 'b');
    assert.equal(findNode(state, 'b'), undefined);
    assert.equal(removeNode(state, 'b'), undefined);
  });

  test('renameFolder 只作用於 folder', () => {
    const state = sampleState();
    assert.ok(renameFolder(state, 'F', '部署'));
    assert.equal((findNode(state, 'F') as FolderNode).name, '部署');
    assert.equal(renameFolder(state, 'a', 'x'), false);
  });

  test('updateScript 局部更新；note 設空字串會清除欄位', () => {
    const state = sampleState();
    assert.ok(updateScript(state, 'a', { note: '備註' }));
    assert.equal((findNode(state, 'a') as ScriptNode).note, '備註');
    assert.ok(updateScript(state, 'a', { note: '' }));
    assert.equal('note' in (findNode(state, 'a') as ScriptNode), false);
  });

  test('moveNodes：拖進 folder 附加到末尾', () => {
    const state = sampleState();
    assert.ok(moveNodes(state, ['a'], { type: 'folder', id: 'G' }));
    const g = findNode(state, 'G') as FolderNode;
    assert.deepEqual(g.children.map((n) => n.id), ['c', 'a']);
    assert.deepEqual(state.roots.map((n) => n.id), ['F', 'd']);
  });

  test('moveNodes：拖到 script 上插在其後（同層往後拖不受 index 位移影響）', () => {
    const state = sampleState();
    assert.ok(moveNodes(state, ['a'], { type: 'after', id: 'd' }));
    assert.deepEqual(state.roots.map((n) => n.id), ['F', 'd', 'a']);
  });

  test('moveNodes：跨層插入', () => {
    const state = sampleState();
    assert.ok(moveNodes(state, ['d'], { type: 'after', id: 'b' }));
    const f = findNode(state, 'F') as FolderNode;
    assert.deepEqual(f.children.map((n) => n.id), ['b', 'd', 'G']);
  });

  test('moveNodes：拖到空白區移到 roots 末尾', () => {
    const state = sampleState();
    assert.ok(moveNodes(state, ['c'], { type: 'root' }));
    assert.deepEqual(state.roots.map((n) => n.id), ['a', 'F', 'd', 'c']);
    assert.equal((findNode(state, 'G') as FolderNode).children.length, 0);
  });

  test('moveNodes：folder 不可移入自身或子孫（no-op）', () => {
    const state = sampleState();
    assert.equal(moveNodes(state, ['F'], { type: 'folder', id: 'G' }), false);
    assert.equal(moveNodes(state, ['F'], { type: 'after', id: 'c' }), false);
    assert.equal(moveNodes(state, ['F'], { type: 'folder', id: 'F' }), false);
    assert.deepEqual(state.roots.map((n) => n.id), ['a', 'F', 'd']);
  });

  test('moveNodes：多選拖曳保持相對順序；已含於選取 folder 內的子孫不重複搬', () => {
    const state = sampleState();
    assert.ok(moveNodes(state, ['F', 'c', 'a'], { type: 'after', id: 'd' }));
    assert.deepEqual(state.roots.map((n) => n.id), ['d', 'F', 'a']);
    // c 仍在 G 內，沒有被拉出來
    assert.equal((findNode(state, 'G') as FolderNode).children[0]?.id, 'c');
  });

  test('extractNodes + insertNodes 可在兩棵樹之間搬移（跨來源拖曳）', () => {
    const from = sampleState();
    const to: ScriptTreeState = { version: 1, roots: [folder('H')] };
    const extracted = extractNodes(from, ['F', 'c']);
    assert.deepEqual(extracted.map((n) => n.id), ['F']);
    assert.deepEqual(from.roots.map((n) => n.id), ['a', 'd']);
    insertNodes(to, extracted, { type: 'folder', id: 'H' });
    const h = findNode(to, 'H') as FolderNode;
    assert.deepEqual(h.children.map((n) => n.id), ['F']);
    // c 跟著 F 一起過去
    assert.equal(findNode(to, 'c')?.id, 'c');
  });

  test('normalizeState 過濾壞節點、補 version；非物件輸入回空 state', () => {
    const normalized = normalizeState({
      roots: [
        { kind: 'script', id: 's1', label: 'ok', path: '~/x.sh', note: '' },
        { kind: 'script', id: '', label: 'no-id', path: '~/y.sh' },
        { kind: 'script', id: 's2', label: 'no-path' },
        { kind: 'folder', id: 'f1', name: 'f', children: [{ kind: 'script', id: 's3', label: 'in', path: '/z' }] },
        { kind: 'folder', id: 'f2', name: 'no-children' },
        'garbage',
      ],
    });
    assert.deepEqual(normalized, {
      version: 1,
      roots: [
        { kind: 'script', id: 's1', label: 'ok', path: '~/x.sh' },
        { kind: 'folder', id: 'f1', name: 'f', children: [{ kind: 'script', id: 's3', label: 'in', path: '/z' }] },
        { kind: 'folder', id: 'f2', name: 'no-children', children: [] },
      ],
    });
    assert.deepEqual(normalizeState(null), { version: 1, roots: [] });
    assert.deepEqual(normalizeState({ roots: 'x' }), { version: 1, roots: [] });
  });
});
