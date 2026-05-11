{ lib, buildNpmPackage }:

buildNpmPackage {
  pname = "retrobureau";
  version = "1.0.0";

  src = lib.cleanSource ./.;

  npmDepsHash = "sha256-8lXN5krDPluvMKVODTgPo7d6sDkHNurPI2OKpboecvw=";

  # Use the package.json build script
  npmBuildScript = "build";

  installPhase = ''
    runHook preInstall
    cp -r dist $out
    runHook postInstall
  '';
}
