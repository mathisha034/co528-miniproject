#!/bin/bash
set -e

echo "Starting MongoDB restore..."

# Ensure environment variables are set
if [ -z "$MONGO_URI" ] || [ -z "$MINIO_URL" ] || [ -z "$MINIO_ACCESS_KEY" ] || [ -z "$MINIO_SECRET_KEY" ]; then
  echo "Error: Required environment variables are missing!"
  echo "Required: MONGO_URI, MINIO_URL, MINIO_ACCESS_KEY, MINIO_SECRET_KEY"
  echo "Optional: RESTORE_FILE (defaults to the latest backup in myminio/backups)"
  exit 1
fi

echo "Configuring MinIO client..."
mc alias set myminio "$MINIO_URL" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"

# If RESTORE_FILE is not set, find the latest one
if [ -z "$RESTORE_FILE" ]; then
  echo "Looking for the latest backup in myminio/backups..."
  LATEST_FILE=$(mc ls myminio/backups/ | grep ".archive" | sort | tail -n 1 | awk '{print $NF}')
  if [ -z "$LATEST_FILE" ]; then
    echo "Error: No backup files found in myminio/backups/"
    exit 1
  fi
  RESTORE_FILE="myminio/backups/$LATEST_FILE"
  echo "Selected latest backup: $RESTORE_FILE"
else
  RESTORE_FILE="myminio/backups/$RESTORE_FILE"
  echo "Using specified backup: $RESTORE_FILE"
fi

# Stream from MinIO and restore to MongoDB
echo "Streaming $RESTORE_FILE from MinIO and restoring to MongoDB (dropping existing collections)..."
mc cat "$RESTORE_FILE" | mongorestore --uri="$MONGO_URI" --archive --drop

echo "Restore complete!"
