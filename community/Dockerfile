FROM node:24-alpine
WORKDIR /srv/nova
COPY --chown=node:node server.cjs ./
RUN mkdir /data && chown node:node /data
USER node
ENV NOVA_COMMUNITY_HOST=0.0.0.0 PORT=8787 NOVA_COMMUNITY_DB=/data/community.sqlite
EXPOSE 8787
VOLUME ["/data"]
CMD ["node", "server.cjs"]
