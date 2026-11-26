const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createServer } = require('node:http');
const CredentialModule = require('@alicloud/credentials');
const { AlibabaOpenApiCredentialProvider, getSDKVersion } = require('../src');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const Credential = CredentialModule.default || CredentialModule;
const corePackage = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(require.resolve('@cloud-idaas/core-sdk')), '../package.json'),
  ),
);

async function requestUserAgent(httpConfiguration, custom = false) {
  let received;
  const server = createServer((request, response) => {
    received = request.headers['user-agent'];
    response.setHeader('connection', 'close');
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ TokenResponse: { AccessToken: 'test-token', ExpiresIn: 3600 } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const plugin = new AlibabaOpenApiCredentialProvider({
    credential: new Credential(
      new CredentialModule.Config({
        type: 'access_key',
        accessKeyId: 'test-ak',
        accessKeySecret: 'test-secret',
      }),
    ),
    ...(custom
      ? {
          tokenOperation: async (_request, endpoint, context) => {
            const response = await fetch(endpoint, {
              headers: { 'user-agent': context.userAgent },
            });
            assert.equal(response.status, 200);
            return { body: { tokenResponse: { accessToken: 'test-token', expiresIn: 3600 } } };
          },
        }
      : {}),
    ...(custom === null ? { tokenOperation: null } : {}),
  });
  try {
    await plugin.getToken(
      {
        idaasInstanceId: 'example',
        clientId: 'example',
        issuer: 'https://issuer.example',
        tokenEndpoint: 'https://issuer.example/token',
        openApiEndpoint: 'http://127.0.0.1:' + server.address().port,
        scope: 'resource|read',
        authnConfiguration: {
          authnMethod: 'PLUGIN',
          pluginName: 'alibabacloudPluginCredentialProvider',
        },
        httpConfiguration,
      },
      'resource|read',
    );
    return received;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('Official OpenAPI User-Agent propagation', () => {
  it('sends the official runtime base once when the custom operation is omitted or null', async () => {
    const previous = os.hostname;
    os.hostname = () => 'local-node';
    try {
      for (const custom of [undefined, null]) {
        const value = await requestUserAgent(undefined, custom);
        assert(
          value.startsWith(`AlibabaCloud (${process.platform}; ${process.arch}) Node.js/`),
          value,
        );
        assert(value.includes(process.versions.node), value);
        for (const marker of [
          'AlibabaCloud ',
          'Node.js/',
          `${process.platform}; ${process.arch}`,
          'idaas-typescript-core-sdk/' + corePackage.version,
          'idaas-typescript-core-alibabacloud-authentication-plugin/' + getSDKVersion(),
          'hostname/local-node',
        ])
          assert.equal(value.split(marker).length, 2, value);
      }
      assert.equal(getSDKVersion(), require('../package.json').version);
    } finally {
      os.hostname = previous;
    }
  });
  it('preserves diagnostic labels through official and custom request implementations', async () => {
    const configuration = {
      userAgentApplicationName: 'app/name',
      userAgentApplicationVersion: '1.2.3-beta',
      userAgentDeploymentEnvironment: 'custom environment',
      userAgentHostname: 'node-alias',
    };
    for (const custom of [false, true]) {
      const value = await requestUserAgent(configuration, custom);
      const prefix = custom
        ? `idaas-typescript-core-sdk/${corePackage.version} (`
        : 'AlibabaCloud (';
      assert(value.startsWith(prefix), value);
      for (const token of [
        'app/app%2Fname',
        'app-version/1.2.3-beta',
        'deployment/custom%20environment',
        'hostname/node-alias',
        'idaas-typescript-core-sdk/' + corePackage.version,
        'idaas-typescript-core-alibabacloud-authentication-plugin/' + getSDKVersion(),
      ])
        assert.equal(value.split(token).length, 2, value);
      const disabled = await requestUserAgent(
        { ...configuration, userAgentHostnameEnabled: false },
        custom,
      );
      assert(!disabled.includes('hostname/'));
      assert(disabled.includes('app/app%2Fname'));
      const override = await requestUserAgent({ ...configuration, userAgent: 'Legacy/9' }, custom);
      assert(override.endsWith('Legacy/9'));
      assert(!override.includes('app/app'));
      assert(!override.includes('cloud-idaas-'));
    }
  });
  it('keeps allowed diagnostic labels when it adds the plugin component', async () => {
    for (const custom of [false, true]) {
      const value = await requestUserAgent(
        {
          userAgentHostnameEnabled: false,
          userAgentApplicationName: 'a'.repeat(128),
          userAgentApplicationVersion: 'b'.repeat(128),
          userAgentDeploymentEnvironment: 'c'.repeat(128),
        },
        custom,
      );
      assert(value.includes('app/' + 'a'.repeat(128)));
      assert(value.includes('app-version/' + 'b'.repeat(128)));
      assert(value.includes('deployment/' + 'c'.repeat(128)));
      assert(
        value.includes(
          'idaas-typescript-core-alibabacloud-authentication-plugin/' + getSDKVersion(),
        ),
      );
    }
  });
  it('builds its own public version from package metadata and falls back for source-only builds', function () {
    this.timeout(30000);
    const root = path.resolve(__dirname, '..');
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'idaas-plugin-version-'));
    try {
      for (const name of ['src', 'scripts', 'tsconfig.json', 'package.json', '.prettierrc.json'])
        fs.cpSync(path.join(root, name), path.join(fixture, name), { recursive: true });
      fs.symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
      const pkg = require('../package.json');
      fs.writeFileSync(
        path.join(fixture, 'package.json'),
        JSON.stringify({ ...pkg, version: '7.6.5-beta.4' }),
      );
      execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
        cwd: fixture,
        stdio: 'pipe',
      });
      const built = require(path.join(fixture, 'dist/index.js'));
      assert.equal(built.getSDKVersion(), '7.6.5-beta.4');
      fs.unlinkSync(path.join(fixture, 'package.json'));
      execFileSync(process.execPath, [path.join(fixture, 'scripts/build-version.cjs')], {
        cwd: fixture,
        stdio: 'pipe',
      });
      assert(
        fs.readFileSync(path.join(fixture, 'src/sdk-version.ts'), 'utf8').includes("'unknown'"),
      );
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });
  it('forwards custom Core configuration while retaining the official SDK prefix', async () => {
    const value = await requestUserAgent({ userAgent: 'ExampleApp/3.0' });
    assert(value.endsWith(' ExampleApp/3.0'), value);
    assert(value.length > ' ExampleApp/3.0'.length);
  });
  it('preserves the official SDK environment extension unless configuration overrides it', async () => {
    const previous = process.env.ALIBABA_CLOUD_USER_AGENT;
    process.env.ALIBABA_CLOUD_USER_AGENT = 'LegacyApp/4.0';
    try {
      const inherited = await requestUserAgent();
      assert(inherited.includes('idaas-typescript-core-sdk/' + corePackage.version));
      assert(inherited.endsWith(' LegacyApp/4.0'));
      const explicit = await requestUserAgent({ userAgent: 'ConfiguredApp/5.0' });
      assert(explicit.endsWith(' ConfiguredApp/5.0'));
      assert(!explicit.includes('LegacyApp/4.0'));
    } finally {
      if (previous === undefined) delete process.env.ALIBABA_CLOUD_USER_AGENT;
      else process.env.ALIBABA_CLOUD_USER_AGENT = previous;
    }
  });
});
