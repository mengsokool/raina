# GCP deployment

Terraform creates a Compute Engine VM, a static IP, and firewall rules. The VM then installs Docker, clones Raina, creates production secrets locally, and starts the complete Raina stack on its first boot.

Use the deployment helper from the repository root instead of running Terraform commands directly:

```bash
scripts/raina-deploy init
# Edit raina.deploy.env
scripts/raina-deploy provision
scripts/raina-deploy dns
scripts/raina-deploy doctor
```

`raina.deploy.env` is the single source for the GCP project, host size, SSH range, domains, repository URL, and Git ref. The helper copies only Raina's Terraform module into `.raina/gcp-module` and stores state in `.raina/gcp.tfstate`, keeping personal Terraform files and state separate.

After `provision`, add A records for the app, API, and MQTT domains to the displayed static IP. Caddy receives HTTPS certificates after DNS propagates. `doctor` checks that each domain resolves to the expected IP and that the API responds at `/healthz`.

The VM exposes ports 80 and 443 for HTTPS plus 1883 for devices. The API, database, EMQX dashboard, and browser MQTT WebSocket port stay behind Docker and Caddy.

Terraform needs Google Cloud credentials from `gcloud auth application-default login` and a Google Cloud project with billing enabled. The repository URL must be public. Use a release tag as `RAINA_REPOSITORY_REF` when deploying production.
