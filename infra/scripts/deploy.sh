#!/usr/bin/env bash
# =============================================================================
# MOSY — Azure Infrastructure Deployment Script
# Provisions all resources for the dev environment.
# Usage: ./infra/scripts/deploy.sh [dev|prod]
# =============================================================================
set -euo pipefail

ENVIRONMENT="${1:-dev}"
LOCATION="southindia"
RESOURCE_GROUP="rg-mosy-${ENVIRONMENT}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BICEP_DIR="${SCRIPT_DIR}/../bicep"
REPO_ROOT="${SCRIPT_DIR}/../.."
ENV_FILE="${REPO_ROOT}/.env.local"
IOT_DEVICE_ID="jetson-poc-001"

echo "============================================="
echo "MOSY Infrastructure Deployment"
echo "Environment: ${ENVIRONMENT}"
echo "Region:      ${LOCATION}"
echo "RG:          ${RESOURCE_GROUP}"
echo "============================================="

# -----------------------------------------------
# 1. Create Resource Group
# -----------------------------------------------
echo ""
echo "[1/7] Creating resource group ${RESOURCE_GROUP}..."
az group create \
  --name "${RESOURCE_GROUP}" \
  --location "${LOCATION}" \
  --tags project=mosy env="${ENVIRONMENT}" owner=balanetra \
  --output none

echo "  Resource group created."

# -----------------------------------------------
# 2. Deploy Bicep template
# -----------------------------------------------
echo ""
echo "[2/7] Deploying Bicep templates (this may take 5-10 minutes)..."
DEPLOYMENT_OUTPUT=$(az deployment group create \
  --resource-group "${RESOURCE_GROUP}" \
  --template-file "${BICEP_DIR}/main.bicep" \
  --parameters "${BICEP_DIR}/parameters/${ENVIRONMENT}.bicepparam" \
  --output json \
  --query "properties.outputs")

echo "  Bicep deployment complete."

# Extract outputs
IOTHUB_NAME=$(echo "${DEPLOYMENT_OUTPUT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['iotHubName']['value'])")
COSMOS_ACCOUNT=$(echo "${DEPLOYMENT_OUTPUT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['cosmosAccountName']['value'])")
COSMOS_ENDPOINT=$(echo "${DEPLOYMENT_OUTPUT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['cosmosEndpoint']['value'])")
STORAGE_ACCOUNT=$(echo "${DEPLOYMENT_OUTPUT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['storageAccountName']['value'])")
FUNCTION_APP=$(echo "${DEPLOYMENT_OUTPUT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['functionAppName']['value'])")
SIGNALR_NAME=$(echo "${DEPLOYMENT_OUTPUT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['signalRName']['value'])")
KEYVAULT_NAME=$(echo "${DEPLOYMENT_OUTPUT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['keyVaultName']['value'])")
KEYVAULT_URI=$(echo "${DEPLOYMENT_OUTPUT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['keyVaultUri']['value'])")
APP_SERVICE_URL=$(echo "${DEPLOYMENT_OUTPUT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['appServiceUrl']['value'])")
ACR_LOGIN_SERVER=$(echo "${DEPLOYMENT_OUTPUT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['acrLoginServer']['value'])")

echo "  IoT Hub:    ${IOTHUB_NAME}"
echo "  Cosmos DB:  ${COSMOS_ACCOUNT}"
echo "  Storage:    ${STORAGE_ACCOUNT}"
echo "  Functions:  ${FUNCTION_APP}"
echo "  SignalR:    ${SIGNALR_NAME}"
echo "  Key Vault:  ${KEYVAULT_NAME}"
echo "  Dashboard:  ${APP_SERVICE_URL}"
echo "  ACR:        ${ACR_LOGIN_SERVER}"

# -----------------------------------------------
# 3. Register IoT Hub device identity
# -----------------------------------------------
echo ""
echo "[3/7] Registering IoT Hub device '${IOT_DEVICE_ID}'..."
az iot hub device-identity create \
  --hub-name "${IOTHUB_NAME}" \
  --device-id "${IOT_DEVICE_ID}" \
  --output none 2>/dev/null || echo "  Device already exists, skipping."

DEVICE_CONN_STRING=$(az iot hub device-identity connection-string show \
  --hub-name "${IOTHUB_NAME}" \
  --device-id "${IOT_DEVICE_ID}" \
  --query connectionString \
  --output tsv)

echo "  Device registered: ${IOT_DEVICE_ID}"

# -----------------------------------------------
# 4. Retrieve connection strings
# -----------------------------------------------
echo ""
echo "[4/7] Retrieving connection strings..."

IOTHUB_CONN_STRING=$(az iot hub connection-string show \
  --hub-name "${IOTHUB_NAME}" \
  --query connectionString \
  --output tsv)

COSMOS_KEY=$(az cosmosdb keys list \
  --name "${COSMOS_ACCOUNT}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query primaryMasterKey \
  --output tsv)

STORAGE_CONN_STRING=$(az storage account show-connection-string \
  --name "${STORAGE_ACCOUNT}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query connectionString \
  --output tsv)

SIGNALR_CONN_STRING=$(az signalr key list \
  --name "${SIGNALR_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query primaryConnectionString \
  --output tsv)

echo "  All connection strings retrieved."

# -----------------------------------------------
# 5. Store secrets in Key Vault
# -----------------------------------------------
echo ""
echo "[5/7] Storing secrets in Key Vault '${KEYVAULT_NAME}'..."

# Wait a moment for RBAC propagation
sleep 10

az keyvault secret set --vault-name "${KEYVAULT_NAME}" --name "iothub-connection-string" --value "${IOTHUB_CONN_STRING}" --output none
az keyvault secret set --vault-name "${KEYVAULT_NAME}" --name "iothub-device-connection-string" --value "${DEVICE_CONN_STRING}" --output none
az keyvault secret set --vault-name "${KEYVAULT_NAME}" --name "cosmos-primary-key" --value "${COSMOS_KEY}" --output none
az keyvault secret set --vault-name "${KEYVAULT_NAME}" --name "storage-connection-string" --value "${STORAGE_CONN_STRING}" --output none
az keyvault secret set --vault-name "${KEYVAULT_NAME}" --name "signalr-connection-string" --value "${SIGNALR_CONN_STRING}" --output none

echo "  5 secrets stored in Key Vault."

# -----------------------------------------------
# 6. Write .env.local
# -----------------------------------------------
echo ""
echo "[6/7] Writing ${ENV_FILE}..."

cat > "${ENV_FILE}" << ENVEOF
# =============================================================================
# MOSY — Local Development Environment (auto-generated by deploy.sh)
# DO NOT COMMIT THIS FILE
# =============================================================================

# Azure General
AZURE_SUBSCRIPTION_ID=$(az account show --query id --output tsv)
AZURE_TENANT_ID=$(az account show --query tenantId --output tsv)
AZURE_RESOURCE_GROUP=${RESOURCE_GROUP}

# IoT Hub
AZURE_IOT_HUB_NAME=${IOTHUB_NAME}
AZURE_IOT_HUB_CONNECTION_STRING=${IOTHUB_CONN_STRING}
AZURE_IOT_DEVICE_CONNECTION_STRING=${DEVICE_CONN_STRING}

# Cosmos DB
AZURE_COSMOS_ENDPOINT=${COSMOS_ENDPOINT}
AZURE_COSMOS_KEY=${COSMOS_KEY}
AZURE_COSMOS_DATABASE=mosydb

# Blob Storage
AZURE_STORAGE_ACCOUNT=${STORAGE_ACCOUNT}
AZURE_STORAGE_CONNECTION_STRING=${STORAGE_CONN_STRING}

# Functions
AZURE_FUNCTIONS_APP_NAME=${FUNCTION_APP}

# SignalR
AZURE_SIGNALR_CONNECTION_STRING=${SIGNALR_CONN_STRING}

# Key Vault
AZURE_KEYVAULT_NAME=${KEYVAULT_NAME}
AZURE_KEYVAULT_URI=${KEYVAULT_URI}

# ACR
AZURE_ACR_LOGIN_SERVER=${ACR_LOGIN_SERVER}

# Admin Dashboard
APP_SERVICE_URL=${APP_SERVICE_URL}

# Edge / MQTT (local dev)
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
MQTT_BROKER_WS_PORT=9001
CRANE_ID=POC-001
SITE_ID=SITE-POC
ENVEOF

echo "  .env.local written."

# -----------------------------------------------
# 7. Summary
# -----------------------------------------------
echo ""
echo "[7/7] Verifying deployed resources..."
az resource list \
  --resource-group "${RESOURCE_GROUP}" \
  --output table \
  --query "[].{Name:name, Type:type, Location:location}"

echo ""
echo "============================================="
echo "MOSY ${ENVIRONMENT} environment deployed!"
echo "============================================="
echo ""
echo "Entra External ID Setup (Manual Steps Required):"
echo "  1. Go to https://entra.microsoft.com"
echo "  2. Create an External ID tenant: mosy-external-id"
echo "  3. Register 2 apps: 'MOSY Admin Dashboard' and 'MOSY Operator Tablet'"
echo "  4. Configure user flows: Phone OTP (operators), Email+MFA (admins)"
echo "  5. Add client IDs to .env.local"
echo ""
