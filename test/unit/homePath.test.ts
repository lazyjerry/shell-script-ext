import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { contractHome, expandHome } from '../../src/core/paths/homePath';

suite('homePath', () => {
  const home = os.homedir();

  test('expandHome 展開 ~ 與 ~/', () => {
    assert.equal(expandHome('~'), home);
    assert.equal(expandHome('~/bin/deploy.sh'), path.join(home, 'bin/deploy.sh'));
  });

  test('expandHome 不誤展開 ~foo 與絕對路徑', () => {
    assert.equal(expandHome('~foo/x'), '~foo/x');
    assert.equal(expandHome('/usr/local/bin'), '/usr/local/bin');
  });

  test('contractHome 收斂家目錄前綴', () => {
    assert.equal(contractHome(home), '~');
    assert.equal(contractHome(path.join(home, 'bin', 'a.sh')), '~/bin/a.sh');
  });

  test('contractHome 只在完整路徑段命中才收斂', () => {
    assert.equal(contractHome(home + 'x/a.sh'), home + 'x/a.sh');
    assert.equal(contractHome('/usr/local/bin/a.sh'), '/usr/local/bin/a.sh');
  });

  test('expand 與 contract 互為反函式', () => {
    const p = path.join(home, '工具', 'deploy 腳本.sh');
    assert.equal(expandHome(contractHome(p)), p);
    assert.equal(contractHome(expandHome('~/工具/x.sh')), '~/工具/x.sh');
  });
});
