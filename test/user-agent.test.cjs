const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createServer } = require('node:http');
const CredentialModule = require('@alicloud/credentials');
const { AlibabaOpenApiCredentialProvider } = require('../dist/index.js');
const Credential = CredentialModule.default || CredentialModule;
const corePackage = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(require.resolve('@cloud-idaas/core-sdk')), '../package.json'),
  ),
);

async function requestUserAgent(userAgent) {
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
        ...(userAgent === undefined ? {} : { httpConfiguration: { userAgent } }),
      },
      'resource|read',
    );
    return received;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('Official OpenAPI User-Agent propagation', () => {
  it('includes the installed Core version and runtime marker on a real official-client request', async () => {
    const value = await requestUserAgent();
    assert(value.includes('cloud-idaas-typescript/' + corePackage.version), value);
    assert(value.includes('Node.js/' + process.versions.node), value);
  });
  it('forwards custom Core configuration while retaining the official SDK prefix', async () => {
    const value = await requestUserAgent('ExampleApp/3.0');
    assert(value.endsWith(' ExampleApp/3.0'), value);
    assert(value.length > ' ExampleApp/3.0'.length);
  });
  it('preserves the official SDK environment extension unless configuration overrides it', async () => {
    const previous = process.env.ALIBABA_CLOUD_USER_AGENT;
    process.env.ALIBABA_CLOUD_USER_AGENT = 'LegacyApp/4.0';
    try {
      const inherited = await requestUserAgent();
      assert(inherited.includes('cloud-idaas-typescript/' + corePackage.version));
      assert(inherited.endsWith(' LegacyApp/4.0'));
      const explicit = await requestUserAgent('ConfiguredApp/5.0');
      assert(explicit.endsWith(' ConfiguredApp/5.0'));
      assert(!explicit.includes('LegacyApp/4.0'));
    } finally {
      if (previous === undefined) delete process.env.ALIBABA_CLOUD_USER_AGENT;
      else process.env.ALIBABA_CLOUD_USER_AGENT = previous;
    }
  });
});
