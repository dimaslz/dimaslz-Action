# 🚨 WORK IN PROGRESS 👨‍💻
It is not ready to use, I am still working on this and just for fun with my personal projects. This project could have important breaking changes.

If you like it and you would like to use it, you can give an star to increase my motivaiton or just open an issue [/issues/new](/issues/new) with the label "I like it!" and some comment :).

# dimaslz deploy
<!-- start description -->
Automate deploying websites in server with docker
<!-- end description -->

## Motivation
I working always in some small project to test a javascript framework, language or learn something about infrastructure. Usually, for my simple projects, I use services like vercel.com, heroku.com, replit.com, netlify.com or something similar but, sometimes have limitations, for sure, the propose is facilitate the deploy and focus your time in your work but, also, sometimes I want to know the details about how to do my self setup for a project. Learnig is the key of my motivation :)

## Idea
Using our self server from [digitalocean](https://m.do.co/c/60a82dd823ee) or [upcloud](https://upcloud.com/signup/?promo=9699PJ) for example, use a Github Action config, has a system like Vercel/Netlify/Heroku/... for backend, frontend or databases but, self-hosted and customizable.

## Usage
By default, this project is focus to work with Node and Static projects, but providing and specific Dockerfile, you can deploy your app in any technology. (examples will come soon)

For example, for an static application:
```yml
on:
  push:
    branches:
      - master
  pull_request:
    branches:
      - master
name: 🚀 Deploy
jobs:
  deploy:
    name: 🎉 Deploy
    runs-on: ubuntu-latest
    steps:
      - name: 🚚 Get latest code
        uses: actions/checkout@master

      - name: GO!
        uses: dimaslz/dimaslz-Action@wip2
        with:
          server_ip: ${{ secrets.CONNECTION_HOST }}
          user: ${{ secrets.CONNECTION_USER }}
          ssh_private_key: ${{ secrets.CONNECTION_PRIVATE_KEY }}
          app_host: dimaslz.dev
          app_name: vite-svelte-ts
          static: false
          env: |
            NODE_ENV=production
```


For a server application, for example an API in NodeJS:
```yml
on:
  push:
    branches:
      - master
  pull_request:
    branches:
      - master
name: 🚀 Deploy
jobs:
  deploy:
    name: 🎉 Deploy
    runs-on: ubuntu-latest
    steps:
      - name: 🚚 Get latest code
        uses: actions/checkout@master

      - name: GO!
        uses: dimaslz/dimaslz-Action@wip2
        with:
          server_ip: ${{ secrets.CONNECTION_HOST }}
          user: ${{ secrets.CONNECTION_USER }}
          ssh_private_key: ${{ secrets.CONNECTION_PRIVATE_KEY }}
          app_host: dimaslz.dev
          app_name: server-app
          app_ports: 8080
          static: false
          env: |
            NODE_ENV=production
```

## Inputs
<!-- start inputs -->
- `server_ip [required]`: IP of your machine to deploy the applications, example: 12.34.56.78
- `user [required]`: User to connect to your machine, example: root
- `ssh_private_key [required]`: SSH private key from your application secrets, to connect to the server, example: `${{ secrets.CONNECTION_PRIVATE_KEY }}`
- `app_host [required]`: application host, as for example: your-domain.com. Will create a config to serve the application in: `${app_name}.your-domain.com`
- `app_name`: application name in kebab case format, as for example: my-app. Finally will serve the application in: https://my-app.your-domain.com. By default repo name
- `app_ports`: port where is serve the application, for example: 8080
- `source`: where the application create the build. By default /dist
- `dockerfile`: do you want to deploy an specific Dockerfile?. Setup the source as for example: '.'
- `env`: your environment vars for the app. Check demo in README.md
- `static`: boolean, by default false. Will create the environment for an static o server app
- `run_command`: for static sites, will is not needed command, for server apps, by default will use `yarn start`, but you can specify the command to run your application for any stack
- `build_command`: by default, we will use 'yarn build' but, you can specify an specific command
- `wildcard_ssl`: by default 'false', set to 'true' if the final url of the project is *.*.domain.tld and, automatically, the action will create an SSL certificate by Certbot (not ready to use, experimental WIP)
- `env_name`: by default 'production', but you can setup the tag as you want. This will not affect to the domain.
- `repo_token`: by default null, but you can setup repo_token: 'secrets.GITHUB_TOKEN'
<!-- end inputs -->

## Comming soon
- Improvements and new commands:
  - `env_name`: If the `env_name` is different to "production" the action could create a specific url like: If for example the `env_name` is "dummy", the script will serve the application on `https://app-name.dummy.your-domain.tld`
  - `env_branch`: Boolean, by default true, but if the branch is different to `master` or `main`, the action could create an environment according to the branch name like: branch name "fix/branch-name", the application will be serve to `https://app-name-fix-branch-name.pr.your-domain.tld`. Remove when is merged or closed.
  - `keep_releases`: Number of images saved to fast rollback
- Dashboard to handle all easy and by a form. Now, per each github repository, and config everything in few clicks.

## Author

```js
{
	name: "Dimas López",
	role: "FullStack Software development",
	alias: "dimaslz",
	twitter: "https://twitter.com/dimaslz",
	site: "https://dimaslz.dev",
	linkedin: "https://www.linkedin.com/in/dimaslopezzurita"
}
```