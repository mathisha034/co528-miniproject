/**
 * Rewrites internal cluster media URLs so the browser can load them.
 *
 * Services (feed-service, research-service, etc.) store object URLs using the
 * internal MinIO DNS name (minio:9000).  Browsers can't resolve cluster-internal
 * hostnames, so we rewrite them to the proxied path:
 *
 *   http://minio:9000/<rest>  →  /minio/<rest>
 *
 * In dev the Vite proxy forwards /minio/* → http://miniproject.local/minio/*.
 * The minio-ingress then strips the /minio prefix and passes the request to
 * minio-http:9000 inside the cluster.
 */
export function proxyMediaUrl(url: string | null | undefined): string {
    if (!url) return '';
    // Replace any variant of the internal minio address
    return url.replace(/https?:\/\/minio(:\d+)?\//, '/minio/');
}
