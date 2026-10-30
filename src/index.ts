import Credential from '@alicloud/credentials';
import Client, { GenerateOauthTokenRequest } from '@alicloud/eiam20211201';
import { $OpenApiUtil } from '@alicloud/openapi-core';
import { RetryOptions, RuntimeOptions } from '@darabonba/typescript';
import {
  ClientException,
  buildUserAgent,
  CredentialException,
  type IDaaSClientConfig,
  type IDaaSCredential,
  isIDaaSException,
  type PluginCredentialProvider,
  ServerException,
  endpointUrl,
  normalizeScope,
  parseTokenResponse,
  record,
  validateConfig,
} from '@cloud-idaas/core-sdk';

/** Official GenerateOauthToken input for one audience, without long-lived access keys. */
export interface GenerateTokenInput {
  /** IDaaS instance ID. */
  instanceId: string;
  /** Machine identity application ID, corresponding to Core clientId. */
  applicationId: string;
  /** Resource server identifier on the left side of scope. */
  audience: string;
  /** Deduplicated permissions for the same resource server. */
  scopeValues: string[];
}
/** Plugin identity and request extension points; construction neither reads identity nor sends requests. */
export interface AlibabaAuthenticationPluginOptions {
  /** Optional official credential instance; otherwise authentication requests use the official default credential chain. */
  credential?: Credential;
  /**
   * Replaces the official OpenAPI call and returns the official body.tokenResponse structure.
   * Custom implementations own their timeout, TLS, and retry policies; errors become sanitized SDK exceptions.
   */
  tokenOperation?: (request: GenerateTokenInput, endpoint: string) => Promise<unknown>;
}

/** Not registered automatically; callers explicitly register the instance with the Core factory. */
export class AlibabaOpenApiCredentialProvider implements PluginCredentialProvider {
  /**
   * Creates an unregistered plugin; injected credential and request sources remain caller-owned.
   * @param options - Optional official credential or custom request implementation.
   */
  constructor(private readonly options: AlibabaAuthenticationPluginOptions = {}) {
    this.options = { ...options };
  }
  /** Returns the stable canonical plugin name shared with Java/Python/Go. */
  getName(): string {
    return 'alibabacloudPluginCredentialProvider';
  }
  /** Supports the initial TypeScript draft name, sharing the same plugin instance and credential cache as the canonical name. */
  getAliases(): readonly string[] {
    return ['alibabacloudAuthenticationPlugin'];
  }
  /**
   * Converts a single-audience scope to an official request and returns credentials with Unix-second expiration.
   * Creates no token cache; the Core provider handles caching, warmup, refresh, and cleanup.
   * @param config - Core configuration containing the plugin name and OpenAPI endpoint.
   * @param scope - resourceServerIdentifier|permission, with multiple permissions separated by spaces.
   * @returns Validated credentials after the official or injected request completes.
   * @throws IDaaSException - Configuration, client, server, or credential errors, without raw requests or sensitive responses.
   */
  async getToken(config: Readonly<IDaaSClientConfig>, scope: string): Promise<IDaaSCredential> {
    config = validateConfig(config);
    const parts = normalizeScope(scope)
      .split(' ')
      .map((value) => value.split('|'));
    const audiences = new Set(parts.map((value) => value[0]!));
    if (audiences.size !== 1)
      throw new ClientException(
        'The OpenAPI plugin supports only one audience per request',
        'MultipleAudienceNotSupported',
      );
    const request: GenerateTokenInput = {
      instanceId: config.idaasInstanceId,
      applicationId: config.clientId,
      audience: parts[0]![0]!,
      scopeValues: [...new Set(parts.map((value) => value[1]!))],
    };
    const endpoint = endpointUrl(config.openApiEndpoint!);
    const started = Date.now();
    try {
      let response: unknown;
      if (this.options.tokenOperation)
        response = await this.options.tokenOperation(request, endpoint.href);
      else {
        const http = config.httpConfiguration;
        const sdkUserAgent = buildUserAgent(http?.userAgent);
        const legacyUserAgent =
          http?.userAgent === undefined ? process.env.ALIBABA_CLOUD_USER_AGENT : undefined;
        // The current official transport reads Config.retryOptions; also explicitly disable legacy runtime retries.
        const retryOptions = new RetryOptions({ retryable: false });
        const client = new Client(
          new $OpenApiUtil.Config({
            endpoint: endpoint.host,
            protocol: endpoint.protocol.slice(0, -1),
            credential: this.options.credential || new Credential(),
            connectTimeout: http?.connectTimeout ?? 5000,
            readTimeout: http?.readTimeout ?? 10000,
            retryOptions,
            userAgent: legacyUserAgent
              ? `${sdkUserAgent} ${buildUserAgent(legacyUserAgent)}`
              : sdkUserAgent,
          }),
        );
        response = await client.generateOauthTokenWithOptions(
          new GenerateOauthTokenRequest(request),
          new RuntimeOptions({
            connectTimeout: http?.connectTimeout ?? 5000,
            readTimeout: http?.readTimeout ?? 10000,
            ignoreSSL: http?.unsafeIgnoreSslCert ?? false,
            autoretry: false,
            maxAttempts: 1,
          }),
        );
      }
      const data = record(record(record(response).body).tokenResponse);
      return parseTokenResponse(
        {
          access_token: data.accessToken,
          expires_in: data.expiresIn,
          expires_at: data.expiresAt,
          token_type: data.tokenType === undefined ? 'Bearer' : data.tokenType,
        },
        started,
      );
    } catch (error) {
      if (isIDaaSException(error)) throw error;
      const value = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
      const status = typeof value.statusCode === 'number' ? value.statusCode : 0;
      if (status >= 400) {
        const ErrorType = status >= 500 ? ServerException : ClientException;
        throw new ErrorType(
          'Alibaba Cloud OpenAPI authentication failed; check the instance, application, and caller permissions',
          'OpenApiAuthenticationFailed',
          status,
        );
      }
      throw new CredentialException(
        'Alibaba Cloud authentication plugin call failed; check the identity source and network',
        'OpenApiAuthenticationFailed',
      );
    }
  }
}
