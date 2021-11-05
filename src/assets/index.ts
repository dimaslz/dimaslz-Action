export const dockerfile = `FROM node:14.15.5-alpine3.10 as builder

WORKDIR /app

COPY . .

RUN yarn install

RUN NODE_ENV=production yarn build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]`;
// export const dockerfile = `FROM nginx:alpine

// WORKDIR /app

// COPY . .

// RUN yarn install

// RUN yarn build

// COPY dist /usr/share/nginx/html

// EXPOSE 80

// CMD ["nginx", "-g", "daemon off;"]`;

export const nginx = `server {
		listen 80;
		listen [::]:80;
		listen 443 ssl;

		root %ROOT%;

		index index.html;

		server_name %SERVER_NAME%;

		add_header Strict-Transport-Security max-age=31536000;
		add_header X-Content-Type-Options nosniff;
		add_header X-Frame-Options "SAMEORIGIN";
		#add_header Content-Security-Policy "default-src 'self';" always;
		add_header "X-XSS-Protection" "1; mode=block";

		access_log              /var/log/nginx/%SERVER_NAME%.access.log;
		error_log               /var/log/nginx/%SERVER_NAME%.error.log;

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
		}

		location /robots.txt {return 200 "User-agent: *\nAllow: /\n";}
}`;
