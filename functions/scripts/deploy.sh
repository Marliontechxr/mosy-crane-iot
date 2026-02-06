#!/usr/bin/env bash
# =============================================================================
# MOSY — Azure Functions Deployment Script
# Creates a clean deployment package without pnpm symlinks.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FUNC_DIR="$(dirname "$SCRIPT_DIR")"
DEPLOY_DIR="$FUNC_DIR/.deploy"

echo "==> Cleaning previous deploy artifacts..."
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

echo "==> Building..."
cd "$FUNC_DIR"
pnpm build

echo "==> Assembling deploy package..."
cp "$FUNC_DIR/host.json" "$DEPLOY_DIR/"
cp -r "$FUNC_DIR/dist" "$DEPLOY_DIR/"

# Create local.settings.json for func CLI to detect runtime
cat > "$DEPLOY_DIR/local.settings.json" << 'SETTINGS'
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsStorage": ""
  }
}
SETTINGS

# Install all external deps via npm for flat node_modules (no pnpm symlinks)
cd "$DEPLOY_DIR"
cat > package.json << 'EOF'
{
  "name": "mosy-functions",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "type": "module",
  "dependencies": {
    "@azure/functions": "^4.5.0",
    "@azure/cosmos": "4.9.0",
    "@azure/storage-blob": "^12.19.0",
    "@azure/communication-sms": "^1.1.0",
    "@azure/identity": "4.4.0",
    "@azure/web-pubsub-client": "^1.0.0",
    "pdfkit": "^0.15.0"
  }
}
EOF

echo "==> Installing runtime dependencies via npm..."
npm install --omit=dev --no-package-lock 2>&1

echo "==> Deploying to Azure..."
func azure functionapp publish mosy-functions-dev

echo "==> Cleaning up..."
rm -rf "$DEPLOY_DIR"

echo "==> Done!"
