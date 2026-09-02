import * as assert from 'node:assert/strict';
import { shellSingleQuote } from '../../src/core/shell/quote';

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
