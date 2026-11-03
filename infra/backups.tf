resource "b2_bucket" "backups" {
  bucket_name = var.backups_bucket_name
  bucket_type = "allPrivate"

  default_server_side_encryption {
    mode      = "SSE-B2"
    algorithm = "AES256"
  }

  # writeFiles can hide a file, and the lifecycle then deletes it, so only the lock stops a stolen key wiping dumps.
  file_lock_configuration {
    is_file_lock_enabled = true
    default_retention {
      mode = "governance"
      period {
        duration = 30
        unit     = "days"
      }
    }
  }

  lifecycle_rules {
    file_name_prefix              = ""
    days_from_uploading_to_hiding = 30
    days_from_hiding_to_deleting  = 1
  }
}

# No readFiles, so a stolen key can't read old dumps. No bypassGovernance, so it can't lift the lock.
resource "b2_application_key" "backups_writer" {
  key_name     = "${var.hostname}-backup-writer"
  capabilities = ["listBuckets", "listFiles", "writeFiles"]
  bucket_ids   = [b2_bucket.backups.bucket_id]
}
