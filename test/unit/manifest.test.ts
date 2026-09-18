import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

// 保存位置設定若允許工作區覆寫，惡意 repo 的 .vscode/settings.json 可把清單換成自己的 scripts.json
suite('package.json 安全設定', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'package.json'), 'utf8'),
  ) as {
    capabilities?: { untrustedWorkspaces?: { supported?: unknown } };
    contributes: { configuration: { properties: Record<string, { scope?: string }> } };
  };

  test('保存位置設定只能在使用者（machine）層級設定', () => {
    const properties = manifest.contributes.configuration.properties;
    assert.equal(properties['shellScripts.dataFolder'].scope, 'machine');
    assert.equal(properties['shellScripts.privateDataFolder'].scope, 'machine');
  });

  test('不支援未受信任的工作區', () => {
    assert.equal(manifest.capabilities?.untrustedWorkspaces?.supported, false);
  });
});
