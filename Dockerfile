FROM node:16-alpine
COPY dist action
COPY assets action/assets

ADD entrypoint.sh /entrypoint.sh

ENTRYPOINT [ "sh", "/entrypoint.sh" ]