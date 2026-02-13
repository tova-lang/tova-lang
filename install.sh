#!/bin/sh
# Tova installer — downloads a prebuilt binary from GitHub Releases.
# Usage: curl -fsSL https://raw.githubusercontent.com/tova-lang/tova-lang/main/install.sh | sh

set -e

REPO="tova-lang/tova-lang"
INSTALL_DIR="$HOME/.tova/bin"
BINARY_NAME="tova"

# Allow overriding the version: TOVA_VERSION=v0.2.0 sh install.sh
VERSION="${TOVA_VERSION:-latest}"

detect_os() {
  case "$(uname -s)" in
    Darwin) echo "darwin" ;;
    Linux)  echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *) echo "unsupported"; return 1 ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    arm64|aarch64) echo "arm64" ;;
    *) echo "unsupported"; return 1 ;;
  esac
}

main() {
  OS=$(detect_os)
  ARCH=$(detect_arch)

  if [ "$OS" = "unsupported" ] || [ "$ARCH" = "unsupported" ]; then
    echo "Error: Unsupported platform: $(uname -s) $(uname -m)"
    echo "Supported: macOS (arm64, x64), Linux (arm64, x64)"
    exit 1
  fi

  ASSET_NAME="tova-${OS}-${ARCH}"
  if [ "$OS" = "windows" ]; then
    ASSET_NAME="${ASSET_NAME}.exe"
  fi

  if [ "$VERSION" = "latest" ]; then
    DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET_NAME}"
  else
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET_NAME}"
  fi

  echo "Installing Tova..."
  echo "  Platform: ${OS}-${ARCH}"
  echo "  Source:   ${DOWNLOAD_URL}"

  mkdir -p "$INSTALL_DIR"

  if command -v curl > /dev/null 2>&1; then
    curl -fsSL "$DOWNLOAD_URL" -o "${INSTALL_DIR}/${BINARY_NAME}"
  elif command -v wget > /dev/null 2>&1; then
    wget -qO "${INSTALL_DIR}/${BINARY_NAME}" "$DOWNLOAD_URL"
  else
    echo "Error: curl or wget is required"
    exit 1
  fi

  chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

  # Add to PATH if not already there
  add_to_path

  echo ""
  echo "Tova installed to ${INSTALL_DIR}/${BINARY_NAME}"
  echo ""
  echo "Run 'tova --version' to verify the installation."
  echo ""
  echo "Note: Some commands (dev, test) require Bun (https://bun.sh)."
  echo "The standalone binary handles: run, build, new, repl, fmt, lsp"
}

add_to_path() {
  EXPORT_LINE="export PATH=\"${INSTALL_DIR}:\$PATH\""

  # Check if already in PATH
  case ":$PATH:" in
    *":${INSTALL_DIR}:"*) return ;;
  esac

  SHELL_NAME="$(basename "$SHELL")"
  case "$SHELL_NAME" in
    zsh)  PROFILE="$HOME/.zshrc" ;;
    bash)
      if [ -f "$HOME/.bashrc" ]; then
        PROFILE="$HOME/.bashrc"
      else
        PROFILE="$HOME/.profile"
      fi
      ;;
    fish)
      # Fish uses a different syntax
      FISH_DIR="$HOME/.config/fish/conf.d"
      mkdir -p "$FISH_DIR"
      echo "set -gx PATH ${INSTALL_DIR} \$PATH" > "${FISH_DIR}/tova.fish"
      echo "  Added to PATH via ${FISH_DIR}/tova.fish"
      return
      ;;
    *)    PROFILE="$HOME/.profile" ;;
  esac

  if [ -f "$PROFILE" ]; then
    # Don't add if already present
    if ! grep -q "$INSTALL_DIR" "$PROFILE" 2>/dev/null; then
      echo "" >> "$PROFILE"
      echo "# Tova" >> "$PROFILE"
      echo "$EXPORT_LINE" >> "$PROFILE"
      echo "  Added to PATH in ${PROFILE}"
      echo "  Restart your shell or run: source ${PROFILE}"
    fi
  else
    echo "$EXPORT_LINE" > "$PROFILE"
    echo "  Created ${PROFILE} with PATH entry"
  fi
}

main
