import * as assert from 'node:assert/strict';
import { isPosixShell, planRun, shellSingleQuote } from '../../src/core/shell/quote';

suite('shellSingleQuote', () => {
  test('一般路徑', () => {
    assert.equal(shellSingleQuote('/usr/local/bin/a.sh'), `'/usr/local/bin/a.sh'`);
  });

  test('含空白與中文', () => {
    assert.equal(shellSingleQuote('/Users/x/共用資料/my script.sh'), `'/Users/x/共用資料/my script.sh'`);
  });

  test('含單引號', () => {
    assert.equal(shellSingleQuote(`/tmp/it's.sh`), `'/tmp/it'\\''s.sh'`);
  });
});

suite('isPosixShell', () => {
  test('bash/zsh/sh 的路徑或類型名視為 POSIX', () => {
    for (const shell of ['/bin/zsh', '/bin/bash', '/bin/sh', 'zsh', 'bash', '/opt/homebrew/bin/bash', 'C:\\Program Files\\Git\\bin\\bash.exe']) {
      assert.equal(isPosixShell(shell), true, shell);
    }
  });

  test('fish、PowerShell、cmd 與未知值都不是 POSIX', () => {
    for (const shell of ['/opt/homebrew/bin/fish', 'fish', 'pwsh', '/usr/local/bin/pwsh', 'powershell.exe', 'C:\\Windows\\System32\\cmd.exe', 'nu', 'python', '', undefined]) {
      assert.equal(isPosixShell(shell), false, String(shell));
    }
  });
});

suite('planRun', () => {
  test('POSIX shell 維持原本送出的指令字串', () => {
    assert.deepEqual(planRun('/Users/x/my script.sh', '/bin/zsh'), {
      mode: 'sendText',
      text: `bash '/Users/x/my script.sh'`,
    });
  });

  test('fish 下含 \\ 與 \' 的惡意路徑不拼字串，原樣當 bash 參數', () => {
    const evil = `/tmp/a\\'; rm -rf ~; echo '.sh`;
    assert.deepEqual(planRun(evil, '/opt/homebrew/bin/fish'), {
      mode: 'direct',
      shellPath: 'bash',
      shellArgs: [evil],
    });
  });

  test('PowerShell 與偵測不到 shell 時同樣改走直接執行', () => {
    const evil = `/tmp/it'; Remove-Item -Recurse ~; '.sh`;
    assert.equal(planRun(evil, 'pwsh').mode, 'direct');
    assert.equal(planRun(evil, '').mode, 'direct');
  });
});
