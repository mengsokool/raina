variable "project_id" {
  description = "The Google Cloud Platform (GCP) Project ID"
  type        = string
}

variable "region" {
  description = "The GCP region for resources (e.g., asia-southeast1 for Singapore/Bangkok)"
  type        = string
  default     = "asia-southeast1"
}

variable "zone" {
  description = "The GCP zone for Compute Engine instance"
  type        = string
  default     = "asia-southeast1-a"
}

variable "environment" {
  description = "Deployment environment name (e.g., production, staging)"
  type        = string
  default     = "production"
}

variable "vm_machine_type" {
  description = "Machine type for the Raina production Compose host"
  type        = string
  default     = "e2-medium" # 2 vCPU, 4GB RAM
}

variable "vm_disk_size_gb" {
  description = "Boot disk size in GB for the Compute Engine VM"
  type        = number
  default     = 30
}

variable "allowed_ssh_cidrs" {
  description = "CIDR blocks allowed to SSH into the Raina host"
  type        = list(string)
}

variable "app_domain" {
  description = "Public HTTPS hostname for the Raina web application"
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$", var.app_domain))
    error_message = "app_domain must be a fully qualified hostname."
  }
}

variable "api_domain" {
  description = "Public HTTPS hostname for the Raina API"
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$", var.api_domain))
    error_message = "api_domain must be a fully qualified hostname."
  }
}

variable "mqtt_domain" {
  description = "Public hostname for MQTT WebSocket clients"
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$", var.mqtt_domain))
    error_message = "mqtt_domain must be a fully qualified hostname."
  }
}

variable "repository_url" {
  description = "Public Git repository cloned to the VM during first boot"
  type        = string

  validation {
    condition     = can(regex("^https://[^[:space:]]+\\.git$", var.repository_url))
    error_message = "repository_url must be a public HTTPS Git URL ending in .git."
  }
}

variable "repository_ref" {
  description = "Git branch or tag deployed on the VM during first boot"
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._/-]{1,128}$", var.repository_ref))
    error_message = "repository_ref may contain only letters, digits, dots, underscores, slashes, and hyphens."
  }
}
