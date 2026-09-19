# ── Compute Engine Instance for Backend Services ──────────────────────────────
resource "google_compute_instance" "backend_vm" {
  name         = "raina-backend-vm"
  machine_type = var.vm_machine_type
  zone         = var.zone
  description  = "Host for the Raina production Docker Compose stack"

  tags = ["raina-backend"]

  boot_disk {
    auto_delete = true
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"
      size  = var.vm_disk_size_gb
      type  = "pd-balanced"
      labels = {
        app = "raina"
        env = var.environment
      }
    }
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.vm_static_ip.address
    }
  }

  metadata_startup_script = templatefile("${path.module}/scripts/bootstrap-raina.sh.tftpl", {
    app_domain     = var.app_domain
    api_domain     = var.api_domain
    mqtt_domain    = var.mqtt_domain
    repository_url = var.repository_url
    repository_ref = var.repository_ref
  })

  labels = {
    app = "raina"
    env = var.environment
  }

  service_account {
    scopes = ["cloud-platform"]
  }

  lifecycle {
    ignore_changes = [
      boot_disk,
      metadata_startup_script,
      description,
      labels
    ]
  }

  depends_on = [
    google_compute_address.vm_static_ip
  ]
}
