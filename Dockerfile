FROM node:6-alpine

COPY package.json index.js server.js /bot/
COPY lib /bot/lib
COPY templates /bot/templates

RUN apk add --no-cache git tini && cd /bot && yarn install --production

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/bot/server.js"]
