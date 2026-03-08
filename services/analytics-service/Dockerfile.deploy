FROM mini_project-analytics-service:v2

USER root

RUN rm -rf /app/dist
RUN mkdir -p /app/dist

COPY --chown=node:node dist/ /app/dist/
COPY --chown=node:node node_modules/ /app/node_modules/

USER node

EXPOSE 3008

CMD ["node", "dist/main"]
