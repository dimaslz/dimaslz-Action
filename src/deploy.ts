import fs from "fs";
// import path from "path";

import { NodeSSH } from "node-ssh";
// import shelljs from "shelljs";
import { Deploy } from "./deploy.class";

const { INPUT_APP_NAME, GITHUB_WORKSPACE, GITHUB_SHA } = process.env;

const ssh = new NodeSSH();

// const getContainersIDByAppName = async (name: string) => {
// 	return new Promise((resolve) => {
// 		ssh.execCommand(`docker ps --format=\"{{.Names}} {{.ID}}\" \
// 		| grep '${name}-container' \
// 		| grep -Po '\s(.*?$)'`).then((result: any) => {
// 			resolve(result.stdout)
// 		});
// 	})
// };

const getImagesIDByAppName = async (name: string) => {
	return new Promise((resolve) => {
		ssh.execCommand(`docker ps --format=\"{{.Names}} {{.ID}}\" \
		| grep '${name}-image' \
		| grep -Po '\s(.*?$)'`).then((result: any) => {
			resolve(result.stdout)
		});
	})
};

const createAppFolder = async () => {
	return new Promise((resolve) => {
		const path = `/var/www/${INPUT_APP_NAME}/production`;
		ssh.execCommand(`mkdir -p ${path}`).then((result: any) => {
			resolve(result.stdout)
		});
	})
};

const appDirExists = async () => {
	const appDir = `/var/www/${INPUT_APP_NAME}`;
	return new Promise((resolve) => {
		const command = `if [ -d "${appDir}" ]; then; echo "true"; else; echo "false"; fi`;
		ssh.execCommand(command).then((result: any) => {
			resolve(result.stdout)
		});
	});
}

const uploadFiles = async (local: string, remote: string) => {
	return new Promise((resolve) => {
		ssh.putDirectory(local, `${remote}/dist`, {
			recursive: true,
		}).then(() => {
			console.log("The Directory thing is done")
			resolve(null);
		}, (error) => {
			console.log("Something's wrong")
			console.log(error)
		})
	})
}

const uploadDockerfile = async (local: string, remote: string) => {
	const DOCKERFILE = `FROM nginx:alpine

WORKDIR /app

COPY dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]`;
	fs.writeFileSync(`${GITHUB_WORKSPACE}/Dockerfile`, DOCKERFILE);

	return new Promise((resolve) => {
		ssh.putFile(`${GITHUB_WORKSPACE}/Dockerfile`, remote).then(() => {
			console.log("The Directory thing is done")
			resolve(null);
		}, (error) => {
			console.log("Something's wrong")
			console.log(error)
		})
	})
}

const uploadNginxConfig = async (nginx: string, remote: string) => {
	fs.writeFileSync(`${GITHUB_WORKSPACE}/nginx`, nginx);

	return new Promise((resolve) => {
		ssh.putFile(`${GITHUB_WORKSPACE}/nginx`, remote).then(() => {
			console.log("The Directory thing is done")
			resolve(null);
		}, (error) => {
			console.log("Something's wrong")
			console.log(error)
		})
	})
}

const envVars = async (appName: string, appHost: string, TIMESTAMP: number, deploy: Deploy) => {
	const CONTAINER_IDs = await deploy.getContainersIDByAppName(`${appName}.${appHost}`);
	const IMAGES_IDs = await getImagesIDByAppName(appName);
	// appname.host.timestamp.github-sha.env.container
	const NEW_CONTAINER_NAME = `${appName}.${appHost}.${TIMESTAMP}.${GITHUB_SHA}.production.container`;
	// appname.host.timestamp.github-sha.env.image
	const NEW_IMAGE_NAME = `${appName}.${appHost}.${TIMESTAMP}.${GITHUB_SHA}.production.image`;

	return {
		CONTAINER_IDs,
		IMAGES_IDs,
		NEW_CONTAINER_NAME,
		NEW_IMAGE_NAME
	}
}

const createImage = async (imageName: string) => {
	console.log("[LOG]: Creating docker image")

	const appDir = `/var/www/${INPUT_APP_NAME}/production`;
	return new Promise(async (resolve) => {
		const command = `cd ${appDir} && docker build --no-cache -t ${imageName} . >> /dev/null`;
		await ssh.execCommand(command);

		const imageId: string = await getImageIDByImageName(imageName);

		resolve(imageId);
	});
}

const getImageIDByImageName = async (imageName: string): Promise<string> => {
	return new Promise((resolve) => {
		const command = `docker images --format="{{.Repository}} {{.ID}}" | grep '${imageName}' | grep -Po '\\s(.*?$)'`;

		ssh.execCommand(command).then((result: any) => {
			resolve(result.stdout);
		});
	});
};

const getContainerIDByContainerName = async (containerName: string): Promise<string> => {
	return new Promise((resolve) => {
		const command = `docker ps --format=\"{{.Names}} {{.ID}}\" | grep '${containerName}' | grep -Po '\\s(.*?$)'"`;

		ssh.execCommand(command).then((result: any) => {
			resolve(result.stdout);
		});
	});
};

const getContainerIPByContainerName = async (containerName: string): Promise<string> => {
	return new Promise((resolve) => {
		const command = `docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${containerName}`;

		ssh.execCommand(command).then((result: any) => {
			resolve(result.stdout);
		});
	});
};

const getContainerPortByContainerName = async (containerName: string): Promise<string> => {
	return new Promise((resolve) => {
		const command = `docker container ls | grep '${containerName}' | grep -Po '\\d+\/tcp' | grep -Po '\\d+'`;

		ssh.execCommand(command).then((result: any) => {
			resolve(result.stdout);
		});
	});
};

const restartNginx = async (): Promise<void> => {
	return new Promise((resolve) => {
		const command = `nginx -t && systemctl restart nginx`;

		ssh.execCommand(command).then((result: any) => {
			resolve(result.stdout);
		});
	});
};

const runContainer = async (imageName: string, containerName: string) => {
	return new Promise(async (resolve) => {
		const command = `docker run --name ${containerName} -d ${imageName} >> /dev/null`;
		await ssh.execCommand(command);

		const containerID = await getContainerIDByContainerName(containerName);
		const containerIP = await getContainerIPByContainerName(containerName);
		const containerPort = await getContainerPortByContainerName(containerName);
		resolve({
			containerID,
			containerIP,
			containerPort,
		});
	});
}

const getNginxConfig = async(
	root: string,
	server_name: string,
	server_url: string,
) => {
	const nginxTpl = `server {
    listen 80;
    listen [::]:80;
    listen 443 ssl;

    root %ROOT%;

    index index.html;

    server_name %SERVER_NAME%;

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
}`;

	return nginxTpl
		.replace("%ROOT%", root)
		.replace("%SERVER_NAME%", server_name)
		.replace("%SERVER_URL%", server_url)
}

export const deploy = async ({
	server_ip,
	user,
	ssh_private_key,
	...rest
}: any) => {
	const TIMESTAMP = new Date().getTime();

	await ssh.connect({
		host: server_ip,
		username: user,
		privateKey: ssh_private_key,
	});

	const d = Deploy.create(ssh);

	const { app_name, app_host } = rest;
	const VARS = await envVars(app_name, app_host, TIMESTAMP, d);

	// const dirExists = await appDirExists();
	// console.log("dirExists", dirExists);
	// if (!dirExists) {
	// 	await createAppFolder();
	// }

	// // Move files
	// const appDir = `/var/www/${app_name}/production`;
	// await uploadFiles(`${GITHUB_WORKSPACE}/dist`, appDir);

	// await uploadDockerfile('', `${appDir}/Dockerfile`);
	// const NEW_IMAGE_ID = await createImage(VARS.NEW_IMAGE_NAME);
	// console.log("NEW_IMAGE_ID", NEW_IMAGE_ID);

	// let NEW_CONTAINER_INFO: any = null;
	// if (NEW_IMAGE_ID) {
	// 	NEW_CONTAINER_INFO = await runContainer(VARS.NEW_IMAGE_NAME, VARS.NEW_CONTAINER_NAME);
	// } else {
	// 	console.log("[LOG]: No image created");
	// }

	// let nginxConfig = '';
	// if (NEW_CONTAINER_INFO) {
	// 	console.log("NEW_CONTAINER_ID", NEW_CONTAINER_INFO);
	// 	nginxConfig = await getNginxConfig(
	// 		`${appDir}/dist`,
	// 		`${app_name}.${app_host}`,
	// 		`http://${NEW_CONTAINER_INFO.containerIP}:${NEW_CONTAINER_INFO.containerPort}`
	// 	)
	// }

	// if (nginxConfig) {
	// 	await uploadNginxConfig(nginxConfig, `/etc/nginx/sites-enabled/${app_name}.${app_host}`);
	// 	await restartNginx();
	// }

	ssh.dispose()

	// console.log("ENV!", process.env);
	// console.log("DONE!", {
	// 	VARS,
	// 	rest,
	// });
	console.log("DONE!", {
		VARS,
	});
};

export default deploy;

// import { Client } from "ssh2";
// const conn = new Client();


// export const deploy = async (args: any) => {
// 	conn.on('ready', () => {
// 		console.log('Client :: ready');
// 		conn.shell((err, stream) => {
// 			if (err) throw err;
// 			stream.on('close', () => {
// 				console.log('Stream :: close');
// 				conn.end();
// 			}).on('data', (data: any) => {
// 				console.log('OUTPUT: ', data);
// 			});
// 			stream.end('ls -al\nexit\n');

// 			conn.destroy();
// 		});
// 	}).connect({
// 		host: args.server_ip,
// 		port: 22,
// 		username: args.user,
// 		privateKey: args.ssh_private_key
// 	});

// 	console.log("DONE!");
// };

// export default deploy;