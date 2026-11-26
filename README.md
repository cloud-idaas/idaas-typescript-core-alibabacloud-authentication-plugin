# IDaaS Alibaba Cloud Authentication Plugin

[Simplified Chinese](README_zh.md) | English

Use an Alibaba Cloud identity to authenticate with IDaaS Core.

## Requirements and installation

Supports Node.js 20, 22, and 24, JavaScript CommonJS/ESM, and TypeScript 4.7 or later. This is a Node.js SDK, not a browser SDK. Check your registry for available beta versions; use a provided package archive when evaluating an unreleased version.

```sh
npm install @cloud-idaas/core-sdk @cloud-idaas/core-alibabacloud-authentication-plugin
```

## Usage

Prepare a Core JSON configuration with plugin authentication, openApiEndpoint, and the other required Core fields. Set CLOUD_IDAAS_CONFIG_PATH to the file, and configure an authorized Alibaba Cloud identity. Save the following ESM example as `example.mjs` and run it with Node.js. CommonJS uses the same named exports through `require`; asynchronous calls belong inside an async function.

```javascript
import { IDaaSCredentialProviderFactory } from '@cloud-idaas/core-sdk';
import { AlibabaOpenApiCredentialProvider } from '@cloud-idaas/core-alibabacloud-authentication-plugin';

IDaaSCredentialProviderFactory.registerPlugin(new AlibabaOpenApiCredentialProvider());
await IDaaSCredentialProviderFactory.init();
try {
  const provider = await IDaaSCredentialProviderFactory.getIDaaSCredentialProvider();
  const token = await provider.getAccessToken();
  // Pass the token to a trusted resource client; never print credentials.
} finally {
  await IDaaSCredentialProviderFactory.close();
}
```

## Configuration

Register `AlibabaOpenApiCredentialProvider` before initializing Core. Set `authnMethod` to `PLUGIN`, `pluginName` to `alibabacloudPluginCredentialProvider`, and provide `openApiEndpoint` along with the required Core configuration. Configure an Alibaba Cloud identity authorized for the intended IDaaS application.

A request scope must identify one audience. Existing configurations using the supported plugin alias remain compatible. `httpConfiguration.userAgent` customizes the SDK identifier appended to the official client's User-Agent. Injected credential sources and request implementations remain caller-owned.

The default User-Agent uses the official Alibaba Cloud SDK runtime and platform base, then adds the Core and `idaas-typescript-core-alibabacloud-authentication-plugin/<version>` identifiers. Public `getSDKVersion()` returns this plugin's build version, including prerelease labels, or `unknown` for an unversioned source build. Core's `httpConfiguration` supplies the diagnostic labels. The hostname is collected locally by default when available. Set `userAgentHostname` for an alias or `userAgentHostnameEnabled: false` to omit it.

An explicit `httpConfiguration.userAgent` keeps the previous full-replacement behavior for the Core/plugin suffix and ignores metadata; the official SDK prefix remains. The legacy `ALIBABA_CLOUD_USER_AGENT` extension is retained only without that explicit override. Labels are diagnostic only and must not contain credentials.

Custom `tokenOperation(request, endpoint, context)` implementations receive `context.userAgent` and must forward it as their User-Agent, retaining their transport SDK identifier if applicable. Existing two-argument callbacks remain compatible. Use the Core SDK version declared in this plugin's dependencies.

## Examples and support

See [examples](examples) for CommonJS, ESM, and TypeScript samples. Report issues through [GitHub Issues](https://github.com/cloud-idaas/idaas-typescript-core-alibabacloud-authentication-plugin/issues). Development instructions are in the repository's [contribution guide](https://github.com/cloud-idaas/idaas-typescript-core-alibabacloud-authentication-plugin/blob/master/CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE).
