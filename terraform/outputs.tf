output "vm_external_ip" {
  description = "Static external IP address of the backend VM"
  value       = google_compute_address.vm_static_ip.address
}

output "emqx_mqtt_tcp_endpoint" {
  description = "MQTT TCP connection endpoint for ESP32 and IoT devices"
  value       = "${google_compute_address.vm_static_ip.address}:1883"
}

output "ssh_command" {
  description = "Command to SSH into the backend VM via gcloud"
  value       = "gcloud compute ssh raina-backend-vm --zone ${var.zone} --project ${var.project_id}"
}
