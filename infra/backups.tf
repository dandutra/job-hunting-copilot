resource "b2_bucket" "backups" {
  bucket_name = var.backups_bucket_name
  bucket_type = "allPrivate"

  default_server_side_encryption {
    mode      = "SSE-B2"
    algorithm = "AES256"
  }

  # A file is hidden 30 days after upload and deleted a day later.
  lifecycle_rules {
    file_name_prefix              = ""
    days_from_uploading_to_hiding = 30
    days_from_hiding_to_deleting  = 1
  }
}

# No deleteFiles and no readFiles: a stolen key can add dumps but cannot remove or read them.
resource "b2_application_key" "backups_writer" {
  key_name     = "${var.hostname}-backup-writer"
  capabilities = ["listBuckets", "listFiles", "writeFiles"]
  bucket_ids   = [b2_bucket.backups.bucket_id]
}
