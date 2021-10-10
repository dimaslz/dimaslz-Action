FROM nginx:alpine

WORKDIR /app

COPY dist dist

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]