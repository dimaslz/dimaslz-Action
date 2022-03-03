# 🚨 WORK IN PROGRESS 👨‍💻
It is not ready to use as a final solution for something that you need 100% of confident , I am still working on this and just for fun with my personal projects. This project could have important breaking changes until stable version.

If you like it and you would like to use it, you can give an star to increase my motivaiton or just open an issue [/issues/new](/issues/new) with the label "I like it!" and some comment :).

# fito deploy action
<!-- start description -->
Automate deploying websites in your own server with docker
<!-- end description -->
**Why Fito?**: Fito is the name of my 🐶🐾

## Motivation
I working always in some small project to test a javascript framework, language or learn something about infrastructure. Usually, for my simple projects, I use services like vercel.com, heroku.com, replit.com, netlify.com or something similar but, sometimes have limitations, for sure, the propose is facilitate the deploy and focus your time in your work but, also, sometimes I want to know the details about how to do my self setup for a project. Learning is the key of my motivation :)

## Idea
Using our self server from [digitalocean](https://m.do.co/c/60a82dd823ee) or [upcloud](https://upcloud.com/signup/?promo=9699PJ) for example, use a Github Action config and have a system like Vercel/Netlify/Heroku/... for backend, frontend or databases but, self-hosted and customizable.

At the moment maybe it is not redy to use for production applications, but works for a lab/learning ecosystem to test any kind of technology.

### Features
- Deploy static projects: build by `node:16.14-alpine` image and `nginx:alpine`.
- Deploy NodeJS project: build and running by `node:16.14-alpine`
- Deploy project with custom Dockerfile: Just create an Dockerfile config in the root of your project and specify it on `dockerfile` as `./`

### TODO
- [ ] publish on Github Actions Marketplace
- [ ] custom nginx config
- [ ] use apache or nginx (currently use only nginx)
- [ ] custom nginx config
- [ ] Node image version
- [ ] use npm or yarn (currently use only yarn)
- [ ] default Golang image
- [ ] default Python image
- [ ] default PHP image
- [ ] automate Cloudflare DNS config setup
- [ ] staging env when a PR is open (ie: yourappname-pr-number.yourdomain.tld)
- [ ] tests
- [ ] automate version release


## Usage
By default, this project is focus to work with Node and Static projects, but providing and specific Dockerfile, you can deploy your app in any technology. (examples will come soon)

#### Step #1
Create the following secrets:
- CONNECTION_HOST: ip of your server
- CONNECTION_USER: connection user
- CONNECTION_PRIVATE_KEY: permission to connect

#### Step #2
Go to your DNS provider and setup the config to your app

| Type  | Name      | Content       | Proxy status  | TTL   |
| -     | -         | -             | -             | -     |
| A     | your-app  | XX.XXX.XX.XX  | proxied       | auto  |


#### Step #3
Setup the config on `.github/workflows/fito.yml`. By default we use `master` branch, but you can use any as you want.
For example, for a static application:
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
        uses: dimaslz/fito-deploy-action@beta
        with:
          server_ip: ${{ secrets.CONNECTION_HOST }}
          user: ${{ secrets.CONNECTION_USER }}
          ssh_private_key: ${{ secrets.CONNECTION_PRIVATE_KEY }}
          app_host: dimaslz.dev
          app_name: static-app
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
        uses: dimaslz/fito-deploy-action@beta
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

#### Step #4
Go to your browser and enjoy your applicaiton!

## How it is works?
Once you define the connection access of your server (from [digitalocean](https://m.do.co/c/60a82dd823ee) or [upcloud](https://upcloud.com/signup/?promo=9699PJ) for example), everytime when you push to the principal branch, `master` in our examples, the action will move the repository files to your server, creating some specific directories previusly. This route `/var/www/your-appname.your-domain.tld/_environment_/_timestamp.short-commit-sha_` is the main directory where:

* `_environment_`: is the environment of your deploy. By default is fixed like `production`, this is the only one at the moment, until allow dynamic names for different cases.
* `_timestamp.short-commit-sha_`: It is an identificator to know when was created and which commit is the content.

Inside `/var/www/your-appname.your-domain.tld/_environment_/_timestamp.short-commit-sha_`, you fill see:

* `Dockerfile`: If you do not specify a path about your custom Dockerfile config (by parammeter `dockerfile`), here will storage the default config according to the type of application.

* `docker-compose.yml`: config to create the image and run the container.

#### docker-compose.yml
```yml
version: '3'
services:
  _REPO_ID_.your-appname.your-domain.tld._TIMESTAMP_._SHORT_COMMIT_SHA_._ENV_:
    container_name: _REPO_ID_.your-appname.your-domain.tld._TIMESTAMP_._SHORT_COMMIT_SHA_._ENV_.container
    image: _REPO_ID_.your-appname.your-domain.tld._TIMESTAMP_._SHORT_COMMIT_SHA_._ENV_.image
    build:
      context: ./ # ./files/path/where-is-your-dockerfile
      dockerfile: Dockerfile # or your Dockerfile name if you use a custom one
    args:
      - ...
    ports:
      - PORT
    environment:
      - ...
```

So then, the action will create the image by `cd /var/www/your-appname.your-domain.tld/_environment_/_timestamp.short-commit-sha_ && docker-compose build` and after `cd /var/www/your-appname.your-domain.tld/_environment_/_timestamp.short-commit-sha_ && docker-compose run`.

When the process is finish, if you enter to you machine, and type `docker ps`, you will have something like:
```bash
CONTAINER ID   IMAGE                                                                               COMMAND                  CREATED        STATUS        PORTS                      NAMES
2dc616dd7268   _REPO_ID_.your-appname.your-domain.tld._TIMESTAMP_._SHORT_COMMIT_SHA_._ENV_.image   "/docker-entrypoint.…"   20 hours ago   Up 20 hours   0.0.0.0:49184->80/tcp      _REPO_ID_.your-appname.your-domain.tld._TIMESTAMP_._SHORT_COMMIT_SHA_._ENV_.container
```

After have the application running, the action will get the local IP, local PORT and create or update the nginx config on `/etc/nginx/sites-enabled/your-appname.your-domain.tld`, test and, restart the nginx service.

The action, when a new content is pushed in `master`, it gets the current container and image running and, when the new application is running and the nginx is updated and restarted, will delete this unnecessary container, image and files.

## Inputs
<!-- start inputs -->
- `server_ip [required]`: IP of your machine to deploy the applications, example: 12.34.56.78
- `user [required]`: User to connect to your machine, example: root
- `ssh_private_key [required]`: SSH private key from your application secrets, to connect to the server, example: "secrets.CONNECTION_PRIVATE_KEY"
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

## New inputs comming soon
- Improvements and new commands:
  - `env_name`: If the `env_name` is different to "production" the action could create a specific url like: If for example the `env_name` is "dummy", the script will serve the application on `https://app-name.dummy.your-domain.tld`
  - `env_branch`: Boolean, by default true, but if the branch is different to `master` or `main`, the action could create an environment according to the branch name like: branch name "fix/branch-name", the application will be serve to `https://app-name-fix-branch-name.pr.your-domain.tld`. Remove when is merged or closed.
  - `keep_releases`: Number of images saved to fast rollback
- Dashboard to handle all easy and by a form. Now, per each github repository, and config everything in few clicks.


## Dashboard
I am working in a dashboard to handle automatically all the config.

* Create and manage your server
* Create and manage yours SSH keys
* Create the main application setup
* Config number of rollback images
* Easy rollback to previews image
* Clean unused containers, images and volumes
* Restart containers
* Download copy
* Create database containers (mongodb, mysql, postgress)
* Others...

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