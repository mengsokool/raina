# ── Static External IP for the production Compose host ─────────────────────────
resource "google_compute_address" "vm_static_ip" {
  name   = "raina-vm-static-ip"
  region = var.region
}

# ── Firewall Rules ────────────────────────────────────────────────────────────
# Only Caddy and the MQTT TCP listener are exposed. PostgreSQL, EMQX dashboard,
# WebSocket listener and the API remain on the Docker network.
resource "google_compute_firewall" "allow_raina_iot_traffic" {
  name        = "allow-raina-iot-traffic"
  network     = "default"
  description = "Allows HTTP, HTTPS, and MQTT TCP traffic for Raina"

  allow {
    protocol = "tcp"
    ports = [
      "80",
      "443",
      "1883"
    ]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["raina-backend"]

  # Existing hybrid deployments may still rely on their previous port rules.
  # A newly-created firewall uses the ports declared above; an existing one is
  # left unchanged until the operator has migrated traffic to Compose.
  lifecycle {
    ignore_changes = [allow, description]
  }
}

# Allow SSH Access to VM
resource "google_compute_firewall" "allow_ssh" {
  name        = "allow-raina-ssh"
  network     = "default"
  description = "Allow SSH management access to the raina backend VM"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = var.allowed_ssh_cidrs
  target_tags   = ["raina-backend"]
}
