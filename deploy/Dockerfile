# The co-op server together with the game it serves.
# Build the game first, on the machine that has the sources:
#   npm run build && npm run build:server
# Only the two built folders go into the image, which keeps it small.
FROM node:22-alpine
WORKDIR /app
COPY dist ./dist
COPY server-dist ./server-dist
# Player progress lives in a volume mounted here, owned by the user the server runs as.
RUN mkdir -p /app/data && chown node:node /app/data
ENV NODE_ENV=production PORT=8787 STATIC_DIR=dist DATA_DIR=/app/data
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server-dist/main.js"]
