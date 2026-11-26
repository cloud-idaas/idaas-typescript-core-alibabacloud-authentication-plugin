# IDaaS Alibaba Cloud Authentication Plugin

简体中文 | [English](README.md)

使用阿里云身份完成 IDaaS Core 认证。

## 环境与安装

支持 Node.js 20、22、24，JavaScript CommonJS/ESM 以及 TypeScript 4.7 及以上版本。本 SDK 用于 Node.js，不用于浏览器。请以 npm registry 中的实际可用版本为准；评估尚未发布的版本时，使用提供的安装包归档。

```sh
npm install @cloud-idaas/core-sdk @cloud-idaas/core-alibabacloud-authentication-plugin
```

## 使用

准备包含插件认证、openApiEndpoint 及其他必填字段的 Core JSON 配置，通过 CLOUD_IDAAS_CONFIG_PATH 指定文件，并配置已授权的阿里云身份。 将以下 ESM 示例保存为 `example.mjs`，通过 Node.js 运行。CommonJS 使用相同的具名导出和 `require`，异步调用放在 async 函数中。

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

## 配置

初始化 Core 前注册 `AlibabaOpenApiCredentialProvider`。将 `authnMethod` 设为 `PLUGIN`、`pluginName` 设为 `alibabacloudPluginCredentialProvider`，并提供 `openApiEndpoint` 及其他 Core 必填配置。阿里云身份须具有访问目标 IDaaS 应用的权限。

一次请求的 scope 只能包含一个 audience。使用已支持插件别名的既有配置仍可兼容。`httpConfiguration.userAgent` 可定制追加到官方客户端 User-Agent 中的 SDK 标识。注入的凭证来源及请求实现仍由调用方管理。

默认 User-Agent 复用阿里云官方 SDK 的运行时和平台标识，并追加 Core 和 `idaas-typescript-core-alibabacloud-authentication-plugin/<version>` 标识。公开的 `getSDKVersion()` 返回插件构建版本，保留预发布标签；无版本的源码构建返回 `unknown`。诊断标签由 Core 的 `httpConfiguration` 提供。默认读取可用的本机主机名，可用 `userAgentHostname` 指定别名，或用 `userAgentHostnameEnabled: false` 关闭。

显式 `httpConfiguration.userAgent` 保留原先完整替换 Core/插件后缀的行为，忽略元数据；官方 SDK 前缀仍保留。仅在未显式覆盖时保留旧 `ALIBABA_CLOUD_USER_AGENT` 扩展。标签只用于诊断，请勿填入凭据。

自定义 `tokenOperation(request, endpoint, context)` 接收 `context.userAgent`，须将其转发为 User-Agent，并按需保留自身传输 SDK 标识。原有双参数回调仍然兼容。请使用此插件依赖中声明的 Core SDK 版本。

## 示例与支持

[examples](examples) 提供 CommonJS、ESM 和 TypeScript 示例。问题反馈请使用 [GitHub Issues](https://github.com/cloud-idaas/idaas-typescript-core-alibabacloud-authentication-plugin/issues)，开发说明见源码仓库的[贡献指南](https://github.com/cloud-idaas/idaas-typescript-core-alibabacloud-authentication-plugin/blob/master/CONTRIBUTING.md)。

## 许可证

[Apache License 2.0](LICENSE)。
