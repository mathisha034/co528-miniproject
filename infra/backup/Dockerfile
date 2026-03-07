FROM alpine:3.19

# Install MongoDB tools (including mongodump/mongorestore), curl, and bash
RUN apk add --no-cache mongodb-tools curl bash

# Install MinIO Client (mc)
RUN curl -o /usr/bin/mc https://dl.min.io/client/mc/release/linux-amd64/mc \
    && chmod +x /usr/bin/mc

# Copy the backup and restore scripts
COPY backup.sh /backup.sh
COPY restore.sh /restore.sh
RUN chmod +x /backup.sh /restore.sh

ENTRYPOINT ["/backup.sh"]
