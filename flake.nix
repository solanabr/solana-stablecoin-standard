{
  description: "Solana Stablecoin Standard (SSS) Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        # Specific Toolchain Versions
        rustVersion = "1.75.0";
        solanaVersion = "1.18.15";
        anchorVersion = "0.30.0";

        # Derive Solana Binaries based on system
        solana-cli = pkgs.stdenv.mkDerivation {
          pname = "solana-cli";
          version = solanaVersion;
          src = if system == "aarch64-darwin" then
            pkgs.fetchurl {
              url = "https://github.com/solana-labs/solana/releases/download/v${solanaVersion}/solana-release-aarch64-apple-darwin.tar.bz2";
              hash = "sha256-b3ddb6300c37d71259c8e4c3620a19c9107525731a87be95ad2e1450f4f01352";
            }
          else if system == "x86_64-linux" then
            pkgs.fetchurl {
              url = "https://github.com/solana-labs/solana/releases/download/v${solanaVersion}/solana-release-x86_64-unknown-linux-gnu.tar.bz2";
              hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
            }
          else pkgs.lib.warn "System ${system} not strictly supported for pre-built binaries" pkgs.emptyDirectory;

          installPhase = ''
            mkdir -p $out/bin
            cp -r bin/* $out/bin/
          '';
        };

        # Anchor CLI (0.30.0)
        anchor-cli = pkgs.stdenv.mkDerivation {
          pname = "anchor-cli";
          version = anchorVersion;
          src = if system == "aarch64-darwin" then
            pkgs.fetchurl {
              url = "https://github.com/coral-xyz/anchor/releases/download/v${anchorVersion}/anchor-cli-v${anchorVersion}-aarch64-apple-darwin.tar.bz2";
              hash = "sha256-0019dfc4b32d63c1392aa264aed2253c1e0c2fb09216f8e2cc269bbfb8bb49b5";
            }
          else pkgs.emptyDirectory;

          installPhase = ''
            mkdir -p $out/bin
            cp anchor $out/bin/
          '';
        };

        rustToolchain = pkgs.rust-bin.stable.${rustVersion}.default.override {
          extensions = [ "rust-src" "rust-analyzer" ];
          targets = [ "wasm32-unknown-unknown" ];
        };

      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            rustToolchain
            solana-cli
            anchor-cli
            nodejs_18
            nodePackages.npm
            pkg-config
            openssl
            libiconv
          ] ++ lib.optionals stdenv.isDarwin [
            darwin.apple_sdk.frameworks.Security
            darwin.apple_sdk.frameworks.SystemConfiguration
          ];

          shellHook = ''
            echo "--- SSS Reproducible Nix Environment ---"
            echo "Rust: $(rustc --version)"
            echo "Solana: $(solana --version | head -n 1)"
            echo "Anchor: $(anchor --version)"
            echo "----------------------------------------"
          '';
        };
      }
    );
}
