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

## Examples and support

See [examples](examples) for CommonJS, ESM, and TypeScript samples. Report issues through [GitHub Issues](https://github.com/cloud-idaas/idaas-typescript-core-alibabacloud-authentication-plugin/issues). Development instructions are in the repository's [contribution guide](https://github.com/cloud-idaas/idaas-typescript-core-alibabacloud-authentication-plugin/blob/master/CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE).
