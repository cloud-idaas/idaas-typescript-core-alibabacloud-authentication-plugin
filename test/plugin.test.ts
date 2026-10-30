import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import Credential, { Config as CredentialConfig } from '@alicloud/credentials';
import Client, { GenerateOauthTokenResponse } from '@alicloud/eiam20211201';
import {
  ClientException,
  type IDaaSClientConfig,
  IDaaSCredentialProviderFactory,
} from '@cloud-idaas/core-sdk';
import { AlibabaOpenApiCredentialProvider, type GenerateTokenInput } from '../src';

function config(): IDaaSClientConfig {
  return {
    idaasInstanceId: 'instance',
    clientId: 'app',
    issuer: 'https://issuer.example',
    tokenEndpoint: 'https://issuer.example/token',
    openApiEndpoint: 'https://eiam.example',
    scope: 'resource|read',
    authnConfiguration: { authnMethod: 'PLUGIN', pluginName: 'alibabacloudAuthenticationPlugin' },
  };
}
function response(): unknown {
  return {
    body: {
      tokenResponse: {
        accessToken: 'token',
        expiresIn: 3600,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
    },
  };
}
describe('Alibaba Cloud authentication plugin', () => {
  it('accepts omitted tokenType and normalizes explicit Bearer casing with strict Core validation', async () => {
    for (const tokenType of [undefined, 'Bearer', 'bearer', 'BEARER', 'bEaReR']) {
      const plugin = new AlibabaOpenApiCredentialProvider({
        tokenOperation: async () => ({
          body: {
            tokenResponse: {
              accessToken: 'token',
              expiresIn: 3600,
              expiresAt: Math.floor(Date.now() / 1000) + 3600,
              ...(tokenType === undefined ? {} : { tokenType }),
            },
          },
        }),
      });
      const credential = await plugin.getToken(config(), 'resource|read');
      assert.equal(credential.accessToken, 'token');
      assert.equal(credential.tokenType, 'Bearer');
    }
  });
  it('TS-TYPE-02 defaults to Bearer only for missing tokenType and rejects invalid explicit values', async () => {
    for (const tokenType of [false, 0, '', null, 'invalid']) {
      const plugin = new AlibabaOpenApiCredentialProvider({
        tokenOperation: async () => ({
          body: {
            tokenResponse: {
              accessToken: 'token',
              expiresIn: 3600,
              expiresAt: Math.floor(Date.now() / 1000) + 3600,
              tokenType,
            },
          },
        }),
      });
      await assert.rejects(plugin.getToken(config(), 'resource|read'), {
        errorCode: 'InvalidTokenType',
      });
    }
  });
  it('authenticates through the factory using the cross-language canonical name and initial TypeScript alias', async () => {
    const plugin = new AlibabaOpenApiCredentialProvider({ tokenOperation: async () => response() });
    assert.equal(plugin.getName(), 'alibabacloudPluginCredentialProvider');
    assert.deepEqual(plugin.getAliases(), ['alibabacloudAuthenticationPlugin']);
    for (const name of [plugin.getName(), ...plugin.getAliases()]) {
      const factory = new IDaaSCredentialProviderFactory({
        plugins: [plugin],
        cache: { logger: { info() {}, warn() {}, error() {} } },
      });
      try {
        await factory.init({
          ...config(),
          authnConfiguration: { authnMethod: 'PLUGIN', pluginName: name },
        });
        assert.equal(await (await factory.getIDaaSCredentialProvider()).getAccessToken(), 'token');
      } finally {
        await factory.close();
      }
    }
  });
  it('applies Core timeout and TLS settings to official calls and disables transparent retries', async () => {
    const original = Client.prototype.generateOauthTokenWithOptions;
    const observed: unknown[] = [];
    Client.prototype.generateOauthTokenWithOptions = async function (_request, runtime) {
      observed.push({
        connectTimeout: this._connectTimeout,
        readTimeout: this._readTimeout,
        runtimeConnectTimeout: runtime.connectTimeout,
        runtimeReadTimeout: runtime.readTimeout,
        ignoreSSL: runtime.ignoreSSL,
        autoretry: runtime.autoretry,
        maxAttempts: runtime.maxAttempts,
        clientRetryable: this._retryOptions.retryable,
      });
      return new GenerateOauthTokenResponse({
        body: {
          tokenResponse: {
            accessToken: 'token',
            expiresIn: 3600,
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          },
        },
      });
    };
    try {
      const plugin = new AlibabaOpenApiCredentialProvider();
      await plugin.getToken(config(), 'resource|read');
      await plugin.getToken(
        {
          ...config(),
          httpConfiguration: {
            connectTimeout: 2300,
            readTimeout: 4700,
            unsafeIgnoreSslCert: true,
          },
        },
        'resource|read',
      );
      assert.deepEqual(observed, [
        {
          connectTimeout: 5000,
          readTimeout: 10000,
          runtimeConnectTimeout: 5000,
          runtimeReadTimeout: 10000,
          ignoreSSL: false,
          autoretry: false,
          maxAttempts: 1,
          clientRetryable: false,
        },
        {
          connectTimeout: 2300,
          readTimeout: 4700,
          runtimeConnectTimeout: 2300,
          runtimeReadTimeout: 4700,
          ignoreSSL: true,
          autoretry: false,
          maxAttempts: 1,
          clientRetryable: false,
        },
      ]);
    } finally {
      Client.prototype.generateOauthTokenWithOptions = original;
    }
  });
  it('maps a single audience, deduplicates permissions, and rejects multiple audiences', async () => {
    let input: GenerateTokenInput | undefined;
    const plugin = new AlibabaOpenApiCredentialProvider({
      tokenOperation: async (request) => {
        input = request;
        return response();
      },
    });
    assert.equal(
      (await plugin.getToken(config(), 'resource|write resource|read resource|read')).accessToken,
      'token',
    );
    assert.deepEqual(input, {
      instanceId: 'instance',
      applicationId: 'app',
      audience: 'resource',
      scopeValues: ['read', 'write'],
    });
    await assert.rejects(plugin.getToken(config(), 'one|read two|write'));
  });
  it('requires explicit registration, caches through Core, and rejects duplicate names', async () => {
    let calls = 0;
    const plugin = new AlibabaOpenApiCredentialProvider({
      tokenOperation: async () => {
        calls++;
        return response();
      },
    });
    const factory = new IDaaSCredentialProviderFactory({
      plugins: [plugin],
      cache: { logger: { info() {}, warn() {}, error() {} } },
    });
    assert.throws(() => factory.registerPlugin(plugin));
    await factory.init(config());
    assert.equal(await (await factory.getIDaaSCredentialProvider()).getAccessToken(), 'token');
    assert.equal(calls, 1);
    await factory.close();
  });
  it('classifies official errors by status and discards raw errors containing sensitive data', async () => {
    const plugin = new AlibabaOpenApiCredentialProvider({
      tokenOperation: async () => {
        throw { statusCode: 403, message: 'private-secret' };
      },
    });
    await assert.rejects(plugin.getToken(config(), 'resource|read'), (error) => {
      assert(error instanceof ClientException);
      assert.equal(error.statusCode, 403);
      assert(!error.message.includes('private-secret'));
      return true;
    });
  });
  it('sends GenerateOauthToken requests to a local server using a real official client', async () => {
    let action = '';
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const query = new URLSearchParams(Buffer.concat(chunks).toString());
        action = String(
          req.headers['x-acs-action'] ||
            query.get('Action') ||
            new URL(req.url!, 'http://localhost').searchParams.get('Action') ||
            '',
        );
        res.setHeader('connection', 'close');
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            TokenResponse: {
              AccessToken: 'live-shape',
              ExpiresIn: 3600,
              ExpiresAt: Math.floor(Date.now() / 1000) + 3600,
            },
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert(address && typeof address === 'object');
    const plugin = new AlibabaOpenApiCredentialProvider({
      credential: new Credential(
        new CredentialConfig({
          type: 'access_key',
          accessKeyId: 'test-ak',
          accessKeySecret: 'test-secret',
        }),
      ),
    });
    try {
      const token = await plugin.getToken(
        { ...config(), openApiEndpoint: `http://127.0.0.1:${address.port}` },
        'resource|read',
      );
      assert.equal(token.accessToken, 'live-shape');
      assert.equal(action, 'GenerateOauthToken');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
