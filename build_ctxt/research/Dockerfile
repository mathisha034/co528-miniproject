FROM mini_project-feed-service:latest
USER root
RUN rm -rf /app/dist && mkdir -p /app/dist
COPY --chown=node:node dist/ /app/dist/
USER node
EXPOSE 3007
CMD ["node", "dist/main"]
