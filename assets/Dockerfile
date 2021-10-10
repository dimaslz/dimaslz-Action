FROM nginx:alpine

WORKDIR /app

COPY dist dist

COPY dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]