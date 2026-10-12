FROM node:22-bookworm-slim
ENV NODE_ENV=production ZAP_HOST=0.0.0.0 ZAP_DATA_DIR=/data ZAP_DOCKER=1
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 7310
VOLUME /data
CMD ["node", "src/run.js"]
