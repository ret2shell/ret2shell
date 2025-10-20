{
  description = "A flake for building the platform";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    pnpm2nix = {
      url = "github:wrvsrx/pnpm2nix-nzbr/adapt-to-v9";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    public-key = {
      url = "file+file:///dev/null";
      flake = false;
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      rust-overlay,
      public-key,
      pnpm2nix,
    }:
    let
      inherit (nixpkgs) lib;
      forAllSystems = lib.genAttrs nixpkgs.lib.systems.flakeExposed;
      overlays = [
        (import rust-overlay)
        pnpm2nix.overlays.default
      ];
      pkgsBySystem = forAllSystems (system: import nixpkgs { inherit system overlays; });
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsBySystem.${system};
          rust = pkgs.rust-bin.nightly.latest.complete;
        in
        {
          default = pkgs.mkShell {
            buildInputs = with pkgs; [
              rust
              pkg-config
              clang_multi
              lld

              pnpm
              nodejs

              hadolint
            ];
          };
        }
      );

      packages = forAllSystems (
        system:
        let
          pkgs = pkgsBySystem.${system};
          inherit (pkgs) dockerTools mkPnpmPackage stdenvNoCC;
          rustPlatform =
            let
              rust = pkgs.rust-bin.stable.latest.default;
            in
            pkgs.makeRustPlatform {
              cargo = rust;
              rustc = rust;
            };

          name = "ret2shell";
          version = self.shortRev or self.dirtyShortRev or (builtins.throw "No git version found");
        in
        {
          backend = rustPlatform.buildRustPackage {
            pname = "${name}-backend";
            version = "git-${version}";
            src = pkgs.nix-gitignore.gitignoreSourcePure ''
              flake.nix
              flake.lock
            '' ./.;
            cargoLock.lockFile = ./Cargo.lock;
            cargoBuildFlags = [ "--bin=r2s-server" ];
            doCheck = false;
            prePatch = lib.throwIf (builtins.readFile public-key == "") "Public key is empty" ''
              cp ${public-key} ./config/pub.bin
            '';
            env.R2S_GIT_VERSION = version;
            nativeBuildInputs = with pkgs; [
              pkg-config
              clang_multi
              lld
            ];
          };
          frontend = mkPnpmPackage {
            pname = "${name}-frontend";
            version = "git-${version}";
            preConfigure = ''
              pnpm config set --global manage-package-manager-versions false
            '';
            src = ./web;
            packageJSON = pkgs.writers.writeJSON "package.json" (
              builtins.removeAttrs (lib.importJSON ./web/package.json) [ "packageManager" ]
            );
          };
          dockerImage =
            let
              gitConfig = pkgs.writeTextDir "etc/gitconfig" (
                lib.generators.toGitINI {
                  user = {
                    email = "platform@ret.sh.cn";
                    name = "Ret2Shell";
                  };
                }
              );
              inherit (self.packages.${system}) frontend backend;
            in
            dockerTools.buildLayeredImage {
              inherit name;
              tag = "latest";
              contents = (
                [
                  gitConfig
                  (stdenvNoCC.mkDerivation {
                    inherit (frontend) name version;
                    src = frontend;
                    installPhase = ''
                      mkdir -p $out/var/www
                      cp -r $src $out/var/www
                    '';
                  })
                  (stdenvNoCC.mkDerivation {
                    inherit (backend) name version;
                    src = backend;
                    installPhase = ''
                      mkdir -p $out/bin
                      cp $src/bin/r2s-server $out/bin/r2s-server
                    '';
                  })
                ]
                ++ (with pkgs; [
                  bashInteractive
                  coreutils
                  curl
                  git
                  skopeo
                ])
              );
            };
        }
      );
    };
}
