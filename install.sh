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

download() {
  URL="$1"
  OUTPUT="$2"

  if command -v curl > /dev/null 2>&1; then
    # Use --progress-bar instead of -s to show download progress
    curl -fL --progress-bar "$URL" -o "$OUTPUT"
  elif command -v wget > /dev/null 2>&1; then
    wget --show-progress -qO "$OUTPUT" "$URL" 2>&1
  else
    echo "Error: curl or wget is required"
    exit 1
  fi
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
    BASE_URL="https://github.com/${REPO}/releases/latest/download"
  else
    BASE_URL="https://github.com/${REPO}/releases/download/${VERSION}"
  fi

  echo "Installing Tova..."
  echo "  Platform: ${OS}-${ARCH}"
  echo ""

  mkdir -p "$INSTALL_DIR"

  TMPFILE="${INSTALL_DIR}/${BINARY_NAME}.download"
  trap 'rm -f "$TMPFILE"' EXIT

  # Try compressed version first (.gz), fall back to uncompressed
  DOWNLOAD_URL="${BASE_URL}/${ASSET_NAME}.gz"
  echo "  Downloading ${ASSET_NAME}.gz..."
  if download "$DOWNLOAD_URL" "$TMPFILE" 2>/dev/null; then
    # Decompress
    if command -v gzip > /dev/null 2>&1; then
      gzip -d -c "$TMPFILE" > "${INSTALL_DIR}/${BINARY_NAME}"
    elif command -v gunzip > /dev/null 2>&1; then
      gunzip -c "$TMPFILE" > "${INSTALL_DIR}/${BINARY_NAME}"
    else
      echo "Error: gzip is required to decompress the binary"
      exit 1
    fi
    rm -f "$TMPFILE"
  else
    # Fall back to uncompressed binary
    DOWNLOAD_URL="${BASE_URL}/${ASSET_NAME}"
    echo "  Downloading ${ASSET_NAME}..."
    if ! download "$DOWNLOAD_URL" "${INSTALL_DIR}/${BINARY_NAME}"; then
      echo ""
      echo "Error: Download failed."
      echo "  URL: ${DOWNLOAD_URL}"
      echo ""
      echo "Please check:"
      echo "  - Your internet connection"
      echo "  - The release exists: https://github.com/${REPO}/releases"
      exit 1
    fi
  fi

  # Verify the downloaded file is not empty
  if [ ! -s "${INSTALL_DIR}/${BINARY_NAME}" ]; then
    echo "Error: Downloaded file is empty or corrupted"
    rm -f "${INSTALL_DIR}/${BINARY_NAME}"
    exit 1
  fi

  chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

  # Quick sanity check — run --version to verify binary works
  if "${INSTALL_DIR}/${BINARY_NAME}" --version > /dev/null 2>&1; then
    INSTALLED_VERSION=$("${INSTALL_DIR}/${BINARY_NAME}" --version 2>/dev/null || echo "unknown")
    echo ""
    echo "  Tova ${INSTALLED_VERSION} installed to ${INSTALL_DIR}/${BINARY_NAME}"
  else
    echo ""
    echo "  Tova installed to ${INSTALL_DIR}/${BINARY_NAME}"
  fi

  # Add to PATH if not already there
  add_to_path

  echo ""
  echo "  Run 'tova --version' to verify the installation."
  echo ""
  echo "  Note: Some commands (dev, test) require Bun (https://bun.sh)."
  echo "  The standalone binary handles: run, build, new, repl, fmt, lsp"
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
