export const nginx_static_dockerfile = `FROM node:16.14-alpine as builder

WORKDIR /app

COPY ./files .

RUN apk update

RUN yarn install

%ENVIRONMENT_VARS%

RUN %BUILD_COMMAND%

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]`;

export const node_server_dockerfile = `FROM node:16.14-alpine

RUN apk update

WORKDIR /app

COPY . .

RUN yarn install

RUN %BUILD_COMMAND%

CMD $COMMAND
`;

const nginx_common_config = `server_name %SERVER_NAME%;

location / {
    gzip on;
    gzip_disable "msie6";
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_buffers 16 8k;
    gzip_http_version 1.1;
    gzip_min_length 256;
    gzip_types text/plain text/css application/json application/x-javascript application/javascript text/xml application/xml application/xml+rss text/javascript application/vnd.ms-fontobject application/x-font-ttf font/opentype image/svg+xml image/x-icon;
    proxy_pass %SERVER_URL%;
    proxy_redirect off;
    proxy_http_version 1.1;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header 'Access-Control-Allow-Origin' '*';
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header 'Cache-Control' 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';
    expires off;
}`;

export const nginx_main_config = `server {
    listen 80;
    listen [::]:80;
    listen 443 ssl;

    add_header Strict-Transport-Security max-age=31536000;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options "SAMEORIGIN";
    #add_header Content-Security-Policy "default-src 'self';" always;
    add_header "X-XSS-Protection" "1; mode=block";

    access_log						/var/log/nginx/%SERVER_NAME%.access.log;
    error_log             /var/log/nginx/%SERVER_NAME%.error.log;

    ${nginx_common_config}

    location /robots.txt {
      return 200 "User-agent: *
        Allow: /
      ";
    }
}`;

export const nginx_main_wildcard_config = `server {
  listen 80;
  server_name ~^(.*)\.%DOMAIN%$;
  set $servername $1;
  rewrite ^(.*)$ https://$servername.%DOMAIN%/$1;
}

server {
    listen 443 ssl;

    add_header Strict-Transport-Security max-age=31536000;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options "SAMEORIGIN";
    #add_header Content-Security-Policy "default-src 'self';" always;
    add_header "X-XSS-Protection" "1; mode=block";

    access_log						/var/log/nginx/%SERVER_NAME%.access.log;
    error_log             /var/log/nginx/%SERVER_NAME%.error.log;

    ssl_certificate    		/etc/letsencrypt/live/%SERVER_NAME%/fullchain.pem;
    ssl_certificate_key		/etc/letsencrypt/live/%SERVER_NAME%/privkey.pem;

    ${nginx_common_config}

    location /robots.txt {
      return 200 "User-agent: *
        Allow: /
      ";
    }
}`;

export const dockerCompose = `version: '3'
services:
  %SERVICE_NAME%:
    container_name: %CONTAINER_NAME%
    image: %IMAGE_NAME%
    build:
      context: %DOCKERFILE_FILE_CONTEXT%
      dockerfile: %DOCKERFILE_FILE_NAME%
      args:
        - %ARGS%
    ports:
      - %PORT%
    environment:
      - %ENVIRONMENT%
`