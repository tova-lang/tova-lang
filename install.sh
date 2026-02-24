#!/bin/sh
# Tova installer — downloads a prebuilt binary from GitHub Releases.
# Usage: curl -fsSL https://raw.githubusercontent.com/tova-lang/tova-lang/main/install.sh | sh

set -e

REPO="tova-lang/tova-lang"
INSTALL_DIR="$HOME/.tova/bin"
BINARY_NAME="tova"

# Allow overriding the version: TOVA_VERSION=v0.2.0 sh install.sh
VERSION="${TOVA_VERSION:-latest}"

# ─── Colors (POSIX-compatible, disabled for non-TTY) ─────────
if [ -t 1 ]; then
  BOLD='\033[1m'
  GREEN='\033[32m'
  YELLOW='\033[33m'
  CYAN='\033[36m'
  RED='\033[31m'
  DIM='\033[2m'
  RESET='\033[0m'
else
  BOLD='' GREEN='' YELLOW='' CYAN='' RED='' DIM='' RESET=''
fi

info()    { printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
warn()    { printf "  ${YELLOW}⚠${RESET} ${YELLOW}%s${RESET}\n" "$1"; }
err()     { printf "  ${RED}✗${RESET} ${RED}%s${RESET}\n" "$1"; }

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
    curl -fL --progress-bar "$URL" -o "$OUTPUT"
  elif command -v wget > /dev/null 2>&1; then
    wget --show-progress -qO "$OUTPUT" "$URL" 2>&1
  else
    err "curl or wget is required"
    exit 1
  fi
}

main() {
  # Banner
  printf "\n"
  printf "  ${CYAN}${BOLD}╦  ╦ ╦═╗ ╦${RESET}\n"
  printf "  ${CYAN}${BOLD}║  ║ ║ ║ ╠╣${RESET}\n"
  printf "  ${CYAN}${BOLD}╩═╝╚═╝╩═╝╩${RESET}  ${DIM}installer${RESET}\n"
  printf "\n"

  OS=$(detect_os)
  ARCH=$(detect_arch)

  if [ "$OS" = "unsupported" ] || [ "$ARCH" = "unsupported" ]; then
    err "Unsupported platform: $(uname -s) $(uname -m)"
    printf "  Supported: macOS (arm64, x64), Linux (arm64, x64)\n"
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

  printf "  Platform: ${BOLD}${OS}-${ARCH}${RESET}\n\n"

  mkdir -p "$INSTALL_DIR"

  TMPFILE="${INSTALL_DIR}/${BINARY_NAME}.download"
  trap 'rm -f "$TMPFILE"' EXIT

  # Determine download URL — try compressed (.gz) first, fall back to uncompressed
  GZ_URL="${BASE_URL}/${ASSET_NAME}.gz"
  RAW_URL="${BASE_URL}/${ASSET_NAME}"
  USE_GZ=false

  if command -v curl > /dev/null 2>&1; then
    if curl -fsSL --head "$GZ_URL" > /dev/null 2>&1; then
      USE_GZ=true
    fi
  elif command -v wget > /dev/null 2>&1; then
    if wget --spider -q "$GZ_URL" 2>/dev/null; then
      USE_GZ=true
    fi
  fi

  if [ "$USE_GZ" = true ]; then
    DOWNLOAD_URL="$GZ_URL"
    printf "  Downloading ${BOLD}${ASSET_NAME}.gz${RESET}...\n"
    if ! download "$DOWNLOAD_URL" "$TMPFILE"; then
      printf "\n"
      err "Download failed."
      printf "  URL: ${DOWNLOAD_URL}\n\n"
      exit 1
    fi
    # Decompress
    if command -v gzip > /dev/null 2>&1; then
      gzip -d -c "$TMPFILE" > "${INSTALL_DIR}/${BINARY_NAME}"
    elif command -v gunzip > /dev/null 2>&1; then
      gunzip -c "$TMPFILE" > "${INSTALL_DIR}/${BINARY_NAME}"
    else
      err "gzip is required to decompress the binary"
      exit 1
    fi
    rm -f "$TMPFILE"
  else
    DOWNLOAD_URL="$RAW_URL"
    printf "  Downloading ${BOLD}${ASSET_NAME}${RESET}...\n"
    if ! download "$DOWNLOAD_URL" "${INSTALL_DIR}/${BINARY_NAME}"; then
      printf "\n"
      err "Download failed."
      printf "  URL: ${DOWNLOAD_URL}\n\n"
      printf "  Please check:\n"
      printf "  - Your internet connection\n"
      printf "  - The release exists: https://github.com/${REPO}/releases\n"
      exit 1
    fi
  fi

  # Verify the downloaded file is not empty
  if [ ! -s "${INSTALL_DIR}/${BINARY_NAME}" ]; then
    err "Downloaded file is empty or corrupted"
    rm -f "${INSTALL_DIR}/${BINARY_NAME}"
    exit 1
  fi

  chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

  # Quick sanity check — run --version to verify binary works
  printf "\n"
  if "${INSTALL_DIR}/${BINARY_NAME}" --version > /dev/null 2>&1; then
    INSTALLED_VERSION=$("${INSTALL_DIR}/${BINARY_NAME}" --version 2>/dev/null || echo "unknown")
    info "${INSTALLED_VERSION} installed to ${BOLD}${INSTALL_DIR}/${BINARY_NAME}${RESET}"
  else
    info "Tova installed to ${BOLD}${INSTALL_DIR}/${BINARY_NAME}${RESET}"
  fi

  # Add to PATH if not already there
  add_to_path

  # Next steps
  printf "\n"
  printf "  ${BOLD}Next steps:${RESET}\n\n"
  printf "    ${CYAN}tova new my-app${RESET}       Create a new project\n"
  printf "    ${CYAN}tova --help${RESET}           See all commands\n"
  printf "    ${CYAN}tova doctor${RESET}           Check your setup\n"
  printf "\n"
  if ! command -v bun > /dev/null 2>&1; then
    warn "Bun not found. Some commands (dev, test) require Bun: ${BOLD}https://bun.sh${RESET}"
    printf "\n"
  fi
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
      info "Added to PATH via ${BOLD}${FISH_DIR}/tova.fish${RESET}"
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
      info "Added to PATH in ${BOLD}${PROFILE}${RESET}"
      printf "  Restart your shell or run: ${CYAN}source ${PROFILE}${RESET}\n"
    fi
  else
    echo "$EXPORT_LINE" > "$PROFILE"
    info "Created ${BOLD}${PROFILE}${RESET} with PATH entry"
  fi
}

main
