FROM node:9-alpine as builder

RUN apk add --no-cache --virtual build-dep python make g++
RUN yarn config set proxy ${http_proxy}
RUN yarn config set https-proxy ${https_proxy}

COPY package.json .babelrc .eslintrc.yaml .eslintignore .flowconfig /bot/
COPY src /bot/src
RUN cd /bot && yarn && cp -r /bot/src/templates /bot/build/templates

FROM node:9-alpine

COPY package.json /bot/
COPY --from=builder /bot/build /bot/build

ARG PRUNE_URL=https://github.com/tj/node-prune/releases/download/v1.0.1/node-prune_1.0.1_linux_amd64.tar.gz

RUN apk add --no-cache git tini && \
    apk add --no-cache --virtual build-dep python make g++ curl && \
    cd /bot && \
    npm install --production && \
    curl -L "$PRUNE_URL" > prune.tar.gz && \
    tar zxf prune.tar.gz node-prune && \
    ./node-prune && \
    rm ./prune.tar.gz ./node-prune && \
    apk del build-dep

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
WORKDIR /bot
CMD ["node", "/bot/build/server.js"]
