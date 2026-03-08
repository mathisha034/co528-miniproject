#!/bin/bash
set -e

SERVICES=("feed" "job" "event" "notification" "research" "analytics")

for svc in "${SERVICES[@]}"; do
  echo "Building $svc-service..."
  docker build -t ${svc}-service:latest ./services/${svc}-service
  echo "Loading into minikube..."
  minikube image load ${svc}-service:latest
  echo "Restarting deployment..."
  kubectl rollout restart deployment ${svc}-service -n miniproject
done

echo "Waiting for pods to be ready..."
kubectl wait --for=condition=ready pod -l app=feed-service -n miniproject --timeout=120s
kubectl wait --for=condition=ready pod -l app=job-service -n miniproject --timeout=120s
kubectl wait --for=condition=ready pod -l app=event-service -n miniproject --timeout=120s
kubectl wait --for=condition=ready pod -l app=notification-service -n miniproject --timeout=120s
kubectl wait --for=condition=ready pod -l app=research-service -n miniproject --timeout=120s
kubectl wait --for=condition=ready pod -l app=analytics-service -n miniproject --timeout=120s

echo "All updated services are ready!"
