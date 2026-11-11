/** Harden the packaged Electron executable without contacting a release service. */
module.exports = async function afterPack(context) {
  const path = require('node:path');
  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');
  const platform = context.electronPlatformName;
  const { productFilename } = context.packager.appInfo;
  const executable = platform === 'darwin'
    ? path.join(context.appOutDir, `${productFilename}.app`)
    : platform === 'win32'
      ? path.join(context.appOutDir, `${productFilename}.exe`)
      // Linux names the binary after `executableName`, not the product name.
      : path.join(context.appOutDir, context.packager.executableName);
  await flipFuses(executable, {
    version: FuseVersion.V1,
    // Unsigned macOS builds must re-sign ad hoc after fuse changes, or Apple Silicon refuses to launch them.
    resetAdHocDarwinSignature: platform === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    // Electron implements embedded ASAR integrity on macOS and Windows only.
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: platform !== 'linux',
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
};
