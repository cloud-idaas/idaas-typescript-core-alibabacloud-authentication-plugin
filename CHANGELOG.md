# Changelog

## 0.1.0-beta.3

- Use the plugin repository name and build version in User-Agent extensions while retaining the official Alibaba Cloud base.
- Expose the plugin build version and propagate Core User-Agent diagnostics through SDK and custom authentication requests. Official requests include a single runtime identifier.
- Use Core SDK 0.1.0-beta.3 for the User-Agent metadata contract.

## 0.1.0-beta.2

- Publish a maintenance prerelease with no API changes.

## 0.1.0-beta.1

- Support IDaaS authentication using an authorized Alibaba Cloud identity.
- Retain compatibility with existing plugin names and honor HTTP configuration.
- Include SDK identification in authentication requests and improve invalid-response handling.
- Provide CommonJS/ESM packages, TypeScript declarations, and English/Chinese usage documentation.
