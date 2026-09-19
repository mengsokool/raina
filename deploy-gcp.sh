#!/usr/bin/env bash
# ==============================================================================
# 🚀 raina IoT Cloud Platform - One-Click GCP Cloud Deployer
# ==============================================================================
# Runs locally or inside Google Cloud Shell.
# Orchestrates Terraform, GCP APIs, VM, EMQX, and Cloud Run Web App.
# ==============================================================================

set -e

GREEN="\033[1;32m"
CYAN="\033[1;36m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
RESET="\033[0m"

echo -e "${CYAN}"
echo "  ██████╗  █████╗ ██╗███╗   ██╗ █████╗ "
echo "  ██╔══██╗██╔══██╗██║████╗  ██║██╔══██╗"
echo "  ██████╔╝███████║██║██╔██╗ ██║███████║"
echo "  ██╔══██╗██╔══██║██║██║╚██╗██║██╔══██║"
echo "  ██║  ██║██║  ██║██║██║ ╚████║██║  ██║"
echo "  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝"
echo "   Automated Google Cloud Deployer     "
echo -e "${RESET}"

# 1. Check prerequisites
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}❌ Error: 'gcloud' CLI is required. Please install Google Cloud SDK or run inside Google Cloud Shell.${RESET}"
  exit 1
fi

# 2. Check Terraform
TERRAFORM_CMD="terraform"
if ! command -v terraform &> /dev/null; then
  if [ -f "$HOME/.local/bin/terraform" ]; then
    export PATH="$HOME/.local/bin:$PATH"
  else
    echo -e "${YELLOW}⚡ Terraform not found in PATH. Installing standalone Terraform binary...${RESET}"
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    case "$ARCH" in
      x86_64|amd64) TF_ARCH="amd64" ;;
      arm64|aarch64) TF_ARCH="arm64" ;;
      *) echo -e "${RED}Unsupported arch: $ARCH${RESET}"; exit 1 ;;
    esac
    mkdir -p "$HOME/.local/bin"
    curl -fsSL "https://releases.hashicorp.com/terraform/1.10.5/terraform_1.10.5_${OS}_${TF_ARCH}.zip" -o /tmp/terraform.zip
    unzip -qo /tmp/terraform.zip -d "$HOME/.local/bin"
    chmod +x "$HOME/.local/bin/terraform"
    rm -f /tmp/terraform.zip
    export PATH="$HOME/.local/bin:$PATH"
    echo -e "${GREEN}✅ Terraform installed to $HOME/.local/bin/terraform${RESET}"
  fi
fi

# 3. Detect / Select GCP Project
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")
if [ -n "$CURRENT_PROJECT" ]; then
  read -r -p "Use active GCP project [$CURRENT_PROJECT]? (Y/n): " CONFIRM_PROJECT
  if [[ "$CONFIRM_PROJECT" =~ ^[Nn]$ ]]; then
    read -r -p "Enter your GCP Project ID: " TARGET_PROJECT
  else
    TARGET_PROJECT="$CURRENT_PROJECT"
  fi
else
  read -r -p "Enter your GCP Project ID: " TARGET_PROJECT
fi

if [ -z "$TARGET_PROJECT" ]; then
  echo -e "${RED}❌ Project ID cannot be empty.${RESET}"
  exit 1
fi

echo -e "${CYAN}📌 Setting active GCP project to: $TARGET_PROJECT${RESET}"
gcloud config set project "$TARGET_PROJECT" --quiet

# 4. Enable Required GCP APIs
echo -e "${CYAN}🔧 Enabling necessary GCP APIs (Compute Engine, Cloud Run, Artifact Registry)...${RESET}"
gcloud services enable \
  compute.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  --project="$TARGET_PROJECT"

# 5. Prepare Terraform Configuration
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$REPO_ROOT/terraform"
cd "$TF_DIR"

if [ ! -f "terraform.tfvars" ]; then
  echo -e "${CYAN}📝 Generating terraform.tfvars...${RESET}"
  cat <<EOF > terraform.tfvars
project_id         = "$TARGET_PROJECT"
region             = "asia-southeast1"
zone               = "asia-southeast1-b"
vm_machine_type    = "e2-medium"
vm_disk_size_gb    = 30
allowed_ssh_cidrs  = ["0.0.0.0/0"]
EOF
  echo -e "${GREEN}✅ Created terraform.tfvars${RESET}"
fi

# Use active gcloud access token for Terraform Google Provider authentication
export GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"

# 6. Initialize & Apply Terraform
echo -e "${CYAN}🚀 Initializing Terraform...${RESET}"
terraform init -upgrade

echo -e "${CYAN}📦 Applying Terraform Infrastructure on GCP...${RESET}"
terraform apply -auto-approve

echo -e "${GREEN}================================================================${RESET}"
echo -e "${GREEN}🎉 raina IoT Platform successfully deployed to Google Cloud!   ${RESET}"
echo -e "${GREEN}================================================================${RESET}"

WEB_URL=$(terraform output -raw cloud_run_web_url 2>/dev/null || echo "")
VM_IP=$(terraform output -raw vm_external_ip 2>/dev/null || echo "")
MQTT_ENDPOINT=$(terraform output -raw emqx_mqtt_tcp_endpoint 2>/dev/null || echo "")

echo -e "${CYAN}🔗 Web Dashboard:       ${GREEN}${WEB_URL}${RESET}"
echo -e "${CYAN}📡 Hono API Direct:      ${GREEN}http://${VM_IP}:3001${RESET}"
echo -e "${CYAN}📊 EMQX MQTT Broker:     ${GREEN}${MQTT_ENDPOINT}${RESET}"
echo -e "${CYAN}⚙️  EMQX Web Console:    ${GREEN}http://${VM_IP}:18083${RESET} (User: admin / Pass: rainasecret_prod_2026)"
echo -e "${CYAN}🔑 Default Login:        ${YELLOW}admin / admin1234${RESET}"
echo -e "${GREEN}================================================================${RESET}"
