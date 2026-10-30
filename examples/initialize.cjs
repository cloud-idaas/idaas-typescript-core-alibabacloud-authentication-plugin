const { IDaaSCredentialProviderFactory } = require('@cloud-idaas/core-sdk');
const {
  AlibabaOpenApiCredentialProvider,
} = require('@cloud-idaas/core-alibabacloud-authentication-plugin');

async function main() {
  IDaaSCredentialProviderFactory.registerPlugin(new AlibabaOpenApiCredentialProvider());
  await IDaaSCredentialProviderFactory.init();
  try {
    const provider = await IDaaSCredentialProviderFactory.getIDaaSCredentialProvider();
    await provider.getCredential();
  } finally {
    await IDaaSCredentialProviderFactory.close();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'SDK call failed');
  process.exitCode = 1;
});
