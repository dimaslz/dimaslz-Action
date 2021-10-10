FROM node:16-alpine
COPY dist action

ADD entrypoint.sh /entrypoint.sh

ENTRYPOINT [ "sh", "/entrypoint.sh" ]