#!/bin/bash
set -e

echo "Starting MongoDB backup..."
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="mongodb_backup_${TIMESTAMP}.archive"

# Ensure environment variables are set
if [ -z "$MONGO_URI" ] || [ -z "$MINIO_URL" ] || [ -z "$MINIO_ACCESS_KEY" ] || [ -z "$MINIO_SECRET_KEY" ]; then
  echo "Error: Required environment variables are missing!"
  echo "Required: MONGO_URI, MINIO_URL, MINIO_ACCESS_KEY, MINIO_SECRET_KEY"
  exit 1
fi

echo "Configuring MinIO client..."
# Wait for MinIO to be available
mc alias set myminio "$MINIO_URL" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"

# Ensure backups bucket exists
echo "Ensuring 'backups' bucket exists..."
mc mb --ignore-existing myminio/backups

# Dump DB directly to archive, then output to stdout and pipe to mc
echo "Dumping MongoDB and streaming to MinIO bucket (backups/$BACKUP_FILE)..."
mongodump --uri="$MONGO_URI" --archive | mc pipe myminio/backups/"$BACKUP_FILE"

echo "Backup complete: $BACKUP_FILE"
