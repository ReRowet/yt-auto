#!/bin/bash

# Configuration
BIN_DIR=".cloudflare/bin"
CLOUDFLARED_VERSION="latest"
OS_TYPE=$(uname -s)
ARCH_TYPE=$(uname -m)

echo "--- Cloudflare Tunnel Setup Tool ---"

# Ensure binary directory exists
mkdir -p "$BIN_DIR"

# Determine correct binary name based on OS
if [[ "$OS_TYPE" == *"MINGW"* ]] || [[ "$OS_TYPE" == *"MSYS"* ]]; then
    BINARY_NAME="cloudflared.exe"
    DOWNLOAD_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    IS_WINDOWS=true
else
    BINARY_NAME="cloudflared"
    DOWNLOAD_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
    IS_WINDOWS=false
fi

# Check if already installed
if [ -f "$BIN_DIR/$BINARY_NAME" ]; then
    echo "[OK] cloudflared is already present in $BIN_DIR"
else
    echo "[INFO] cloudflared not found. Downloading for $OS_TYPE..."
    
    if curl -L "$DOWNLOAD_URL" -o "$BIN_DIR/$BINARY_NAME"; then
        echo "[SUCCESS] cloudflared downloaded to $BIN_DIR"
        chmod +x "$BIN_DIR/$BINARY_NAME"
    else
        echo "[ERROR] Failed to download cloudflared. Please check your internet connection."
        exit 1
    fi
fi

echo "------------------------------------"
echo "Cloudflare Tunnel is READY!"
echo "To start the tunnel, run:"
if [ "$IS_WINDOWS" = true ]; then
    echo "  ./.cloudflare/bin/cloudflared.exe tunnel --config .cloudflare/config.yml run smshub"
else
    echo "  ./.cloudflare/bin/cloudflared tunnel --config .cloudflare/config.yml run smshub"
fi
echo "------------------------------------"
