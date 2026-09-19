#!/bin/sh
set -eu

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 APP_DOMAIN API_DOMAIN MQTT_DOMAIN" >&2
  exit 2
fi

for domain in "$@"; do
  case "$domain" in
    *[!a-zA-Z0-9.-]*|.*|-*|*..*|*.|*-)
      echo "Invalid domain: $domain" >&2
      exit 2
      ;;
  esac
  case "$domain" in
    *.*) ;;
    *) echo "Use a fully qualified domain: $domain" >&2; exit 2 ;;
  esac
done

if [ -e .env.production ]; then
  echo ".env.production already exists; refusing to overwrite it." >&2
  exit 1
fi

command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required to generate secrets." >&2
  exit 1
}

database_password=$(openssl rand -hex 24)
dashboard_password=$(openssl rand -hex 24)
broker_password=$(openssl rand -hex 24)
setup_token=$(openssl rand -hex 24)

umask 077
set -C
cat > .env.production <<EOF
POSTGRES_USER=raina
POSTGRES_DB=raina
POSTGRES_PASSWORD=$database_password
EMQX_DASHBOARD_USERNAME=admin
EMQX_DASHBOARD_PASSWORD=$dashboard_password
EMQX_SERVER_PASSWORD=$broker_password
SETUP_TOKEN=$setup_token
APP_DOMAIN=$1
API_DOMAIN=$2
MQTT_DOMAIN=$3
CORS_ORIGIN=https://$1
PUBLIC_API_URL=https://$2
PUBLIC_MQTT_HOST=$3
PUBLIC_MQTT_WS_URL=wss://$3/mqtt
AUTO_MIGRATE=true
AUTO_SEED=false
EOF

echo "Created .env.production with private permissions."
echo "Review domains, DNS and firewall, then run:"
echo "docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build"
