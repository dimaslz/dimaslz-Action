import * as core from "@actions/core";
import fs from "fs";

import {
  nginx_static_dockerfile,
  node_server_dockerfile,
  nginx_container_config,
  nginx_main_config,
} from "./assets";

const { GITHUB_WORKSPACE, INPUT_DOCKERFILE, INPUT_ENV } = process.env;

export class Deploy {
  private static instance: Deploy;
  private static ssh: any;
  private static ARGS: any;

  private constructor() {}

  static create(ssh: any, args: any): Deploy {
    this.ARGS = args;
    if (!Deploy.instance && ssh) {
      Deploy.ssh = ssh;
      Deploy.instance = new Deploy();
    }

    return Deploy.instance;
  }

  async getContainersIDByAppName(name: string): Promise<string> {
    return new Promise((resolve, reject) => {
      Deploy.ssh
        .execCommand(
          `docker ps --format="{{.Names}} {{.ID}}" \
			| grep '${name}' \
			| grep -Po '\\s(.*?$)'`
        )
        .then((result: any) => {
          if (result.stderr) {
            this.close();
            reject(result.stderr);
          }

          resolve(result.stdout.replace(/\n/gm, ""));
        });
    });
  }

  async getImagesIDByAppName(name: string): Promise<string> {
    return new Promise((resolve, reject) => {
      Deploy.ssh
        .execCommand(
          `docker images --format="{{.Repository}} {{.ID}}" \
			| grep '${name}' \
			| grep -Po '\\s(.*?$)'`
        )
        .then((result: any) => {
          if (result.stderr) {
            this.close();
            reject(result.stderr);
          }

          resolve(result.stdout.replace(/\n/gm, ""));
        });
    });
  }

  async createAppFolder(appDir: string) {
    console.log("[LOG]: Creating app directory");

    return new Promise((resolve, reject) => {
      Deploy.ssh.execCommand(`mkdir -p ${appDir}`).then((result: any) => {
        if (result.stderr) {
          console.log("[LOG]: result.stderr", result.stderr);
          this.close();
          reject(result.stderr);
        }

        console.log("[LOG]: appDir", appDir);
        resolve(appDir);
      });
    });
  }

  async appDirExists(appDir: string) {
    return new Promise((resolve, reject) => {
      const command = `if [ -d "${appDir}" ]; then echo "true"; else echo "false"; fi`;
      Deploy.ssh.execCommand(command).then((result: any) => {
        if (result.stderr) {
          this.close();
          reject(result.stderr);
        }

        resolve(JSON.parse(result.stdout));
      });
    });
  }

  async uploadFiles(local: string, remote: string) {
    return new Promise((resolve, reject) => {
      const failed: any[] = [];
      const successful: any[] = [];

      Deploy.ssh
        .putDirectory(local, `${remote}`, {
          recursive: true,
          concurrency: 10,
          validate: () => true,
          tick: function (localPath: any, remotePath: any, error: any) {
            if (error) {
              failed.push(localPath);
            } else {
              successful.push(localPath);
            }
          },
        })
        .then(
          (status: any) => {
            console.log("The Directory thing is done");
            console.log(
              "the directory transfer was",
              status ? "successful" : "unsuccessful"
            );
            console.log("failed transfers", failed.join(", "));
            console.log("successful transfers", successful.join(", "));

            resolve(null);
          },
          (error: any) => {
            this.close();

            console.log("Something's wrong");
            console.log(error);
            reject(error);
          }
        );
    });
  }

  async uploadDockerfile(remote: string) {
    if (INPUT_DOCKERFILE === ".") {
      core.error("Maybe you want to say './'");
      this.close();
      return false;
    }

    if (INPUT_DOCKERFILE) return Promise.resolve(null);

    core.info("Creating default Dockerfile");
    if (Deploy.ARGS.static) {
      fs.writeFileSync(
        `${GITHUB_WORKSPACE}/__Dockerfile`,
        nginx_static_dockerfile
      );
    } else {
      fs.writeFileSync(
        `${GITHUB_WORKSPACE}/__Dockerfile`,
        node_server_dockerfile
      );
    }

    return new Promise((resolve, reject) => {
      Deploy.ssh
        .putFile(`${GITHUB_WORKSPACE}/__Dockerfile`, `${remote}/__Dockerfile`)
        .then(
          () => {
            console.log("The Directory thing is done");
            resolve(null);
          },
          (error: any) => {
            this.close();
            console.log("Something's wrong");
            console.log(error);
            reject(error);
          }
        );
    });
  }

  async uploadEnvVars(remote: string) {
    let ENV_VARS = "";
    if (INPUT_ENV) {
      ENV_VARS = INPUT_ENV?.split(/\n/)
        .filter(e => e)
        .join("\n");
      fs.writeFileSync(`${GITHUB_WORKSPACE}/.__env`, ENV_VARS);

      core.info("Creating environment vars");

      return new Promise((resolve, reject) => {
        Deploy.ssh
          .putFile(`${GITHUB_WORKSPACE}/.__env`, `${remote}/.__env`)
          .then(
            () => {
              console.log("The Directory thing is done");
              resolve(null);
            },
            (error: any) => {
              this.close();
              console.log("Something's wrong");
              console.log(error);
              reject(error);
            }
          );
      });
    }

    return Promise.resolve(null);
  }

  async uploadNginxConfig(nginx: string, remote: string) {
    fs.writeFileSync(`${GITHUB_WORKSPACE}/nginx`, nginx);

    return new Promise((resolve, reject) => {
      Deploy.ssh.putFile(`${GITHUB_WORKSPACE}/nginx`, remote).then(
        () => {
          resolve(null);
        },
        (error: any) => {
          this.close();
          core.error("Something's wrong");
          console.log(error);
          reject(error);
        }
      );
    });
  }

  dockerfileExists(path: string) {
    return fs.existsSync(path);
  }

  async createImage(appDir: string, imageName: string) {
    console.log(`[LOG]: Creating docker image`);

    let command = `cd ${appDir} && docker build --no-cache -t ${imageName}`;

    if (INPUT_DOCKERFILE) {
      if (INPUT_DOCKERFILE === "./") {
        if (!this.dockerfileExists(`${GITHUB_WORKSPACE}/Dockerfile`)) {
          this.close();
          core.error("Dockerfile doesn't exists.");
          return false;
        }

        command += ` -f ${INPUT_DOCKERFILE}Dockerfile .`;
      } else if (/\.\/.+?/.test(INPUT_DOCKERFILE)) {
        if (!this.dockerfileExists(`${GITHUB_WORKSPACE}/${INPUT_DOCKERFILE}`)) {
          this.close();
          core.error("Dockerfile doesn't exists.");
          return false;
        }

        command += ` -f ${INPUT_DOCKERFILE} .`;
      }
    } else {
      command += ` -f ./__Dockerfile .`;
    }

    return new Promise(async (resolve, reject) => {
      try {
        console.log("COMMAND", command);

        await Deploy.ssh.execCommand(command).then((result: any) => {
          if (result.stderr) {
            this.close();
            reject(result.stderr);
          }
        });

        const imageId: string = await this.getImageIDByImageName(imageName);

        resolve(imageId);
      } catch (err) {
        this.close();
        reject(err);
      }
    });
  }

  async getImageIDByImageName(imageName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = `docker images --format="{{.Repository}} {{.ID}}" | grep '${imageName}' | grep -Po '\\s(.*?$)'`;

      Deploy.ssh.execCommand(command).then((result: any) => {
        if (result.stderr) {
          this.close();
          reject(result.stderr);
        }

        resolve(result.stdout);
      });
    });
  }

  async getContainerIDByContainerName(containerName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = `docker ps --format="{{.Names}} {{.ID}}" | grep '${containerName}' | grep -Po '\\s(.*?$)'`;

      Deploy.ssh.execCommand(command).then((result: any) => {
        if (result.stderr) {
          this.close();
          reject(result.stderr);
        }

        resolve(result.stdout);
      });
    });
  }

  async getContainerIPByContainerName(containerName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = `docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${containerName}`;

      Deploy.ssh.execCommand(command).then((result: any) => {
        if (result.stderr) {
          this.close();
          reject(result.stderr);
        }

        resolve(result.stdout);
      });
    });
  }

  async getContainerPortByContainerName(
    containerName: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = `docker container ls | grep '${containerName}' | grep -Po '\\d+\/tcp' | grep -Po '\\d+'`;

      Deploy.ssh.execCommand(command).then((result: any) => {
        if (result.stderr) {
          this.close();
          reject(result.stderr);
        }

        resolve(result.stdout);
      });
    });
  }

  async containerExists(containerName: string) {
    return new Promise(async resolve => {
      const exists = await this.getContainerIDByContainerName(containerName);
      resolve(!!exists.trim());
    });
  }

  async volumeExists(volumeName: string) {
    return new Promise((resolve, reject) => {
      const command = `docker volume ls --format="{{.Name}}" | grep "${volumeName}"`;

      Deploy.ssh.execCommand(command).then((result: any) => {
        if (result.stderr) {
          this.close();
          console.log(result.stderr);
          reject(false);
        }

        const value = !!result.stdout.trim();
        resolve(value);
      });
    });
  }

  async createVolume(volumeName: string) {
    return new Promise((resolve, reject) => {
      const command = `docker volume create ${volumeName}`;

      Deploy.ssh.execCommand(command).then((result: any) => {
        if (result.stderr) {
          this.close();
          console.log(result.stderr);
          reject(false);
        }

        const value = !!result.stdout.trim();
        resolve(value);
      });
    });
  }

  async removeVolume(volumeName: string) {
    return new Promise((resolve, reject) => {
      const command = `docker volume rm -f ${volumeName}`;

      Deploy.ssh.execCommand(command).then((result: any) => {
        if (result.stderr) {
          this.close();
          console.log(result.stderr);
          reject(false);
        }

        resolve(true);
      });
    });
  }

  async imageExists(imageId: string) {
    return new Promise(async resolve => {
      const exists = await this.getImageIDByImageName(imageId);
      resolve(!!exists.trim());
    });
  }

  async stopContainerByName(containerName: string): Promise<boolean> {
    const stop = async (container: string) => {
      return new Promise((resolve, reject) => {
        const command = `docker stop ${container}`;

        Deploy.ssh.execCommand(command).then((result: any) => {
          if (result.stderr) {
            core.error(result.stderr);
            this.close();
            reject(false);
          }

          resolve(true);
        });
      });
    };

    if (!containerName) {
      core.error(`Container name/id is mandatory.`);
      return false;
    }

    const arrContainerIDs = containerName.split(" ");
    const isSingle = arrContainerIDs.length === 1;
    if (isSingle) {
      const exists = await this.containerExists(containerName);

      if (exists) {
        await stop(containerName);
        core.info(`Container ${containerName} has been stopped.`);

        return true;
      }

      core.error(`Container ${containerName} doesn't exists.`);
    } else if (!isSingle) {
      for (const containerID of arrContainerIDs) {
        const stopped = await stop(containerID);
        if (stopped) {
          core.info(`Container ${containerName} has been stopped.`);
        }
      }
    }

    return false;
  }

  async deleteContainerByName(containerName: string): Promise<boolean> {
    const remove = async (container: string) => {
      return new Promise((resolve, reject) => {
        const command = `docker rm -f ${container}`;

        Deploy.ssh.execCommand(command).then((result: any) => {
          if (result.stderr) {
            core.error(result.stderr);
            this.close();
            reject(false);
          }

          resolve(true);
        });
      });
    };

    if (!containerName) {
      core.error(`Container name/id is mandatory.`);
      return false;
    }

    const arrContainerIDs = containerName.split(" ");
    const isSingle = arrContainerIDs.length === 1;
    if (isSingle) {
      const exists = await this.containerExists(containerName);

      if (exists) {
        await remove(containerName);
        core.info(`Container ${containerName} has been deleted.`);

        return true;
      }

      core.error(`Container ${containerName} doesn't exists.`);
    } else if (!isSingle) {
      for (const containerID of arrContainerIDs) {
        const removed = await remove(containerID);
        if (removed) {
          core.info(`Container ${containerName} has been deleted.`);
        } else {
          core.error(`Container ${containerName} not deleted.`);
        }
      }
    }

    return false;
  }

  async removeImagesByName(imageId: string): Promise<boolean> {
    const remove = async (image: string) => {
      return new Promise((resolve, reject) => {
        const command = `docker rmi -f ${image}`;

        Deploy.ssh.execCommand(command).then((result: any) => {
          if (result.stderr) {
            core.error(result.stderr);
            this.close();
            reject(false);
          }

          resolve(true);
        });
      });
    };

    if (!imageId) {
      core.error(`Image id is mandatory.`);
      return false;
    }

    const arrImageIDs = imageId.split(" ");
    const isSingle = arrImageIDs.length === 1;
    if (isSingle) {
      const exists = await this.imageExists(imageId);

      if (exists) {
        await remove(imageId);
        core.info(`Image ${imageId} has been deleted.`);

        return true;
      }

      core.error(`Image ${imageId} doesn't exists.`);
    } else if (!isSingle) {
      for (const imageID of arrImageIDs) {
        const removed = await remove(imageID);
        if (removed) {
          core.info(`Image ${imageId} has been deleted.`);
        } else {
          core.error(`Image ${imageId} not deleted.`);
        }
      }
    }

    return false;
  }

  async restartNginx(): Promise<void> {
    return new Promise(resolve => {
      const command = `nginx -t && systemctl restart nginx`;

      Deploy.ssh.execCommand(command).then((result: any) => {
        // if (result.stderr) {
        // 	this.close();
        // 	reject(result.stderr);
        // }

        resolve(result.stdout);
      });
    });
  }

  async runContainer(
    imageName: string,
    containerName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    volumeName: string,
    appDir: string
  ) {
    console.log(`Running container ${containerName}`);
    return new Promise(async (resolve, reject) => {
      // const command = `docker run --name ${containerName} -v ${volumeName}:/app -d ${imageName}`;
      let envFileCmd = "";
      if (INPUT_ENV) {
        envFileCmd = `--env-file ${appDir}/.__env`;
      }
      const command = `docker run --name ${containerName} ${envFileCmd} -d ${imageName}`;

      await Deploy.ssh.execCommand(command).then((result: any) => {
        if (result.stderr) {
          this.close();
          reject(result.stderr);
        }
      });

      const containerID = await this.getContainerIDByContainerName(
        containerName
      );
      const containerIP = await this.getContainerIPByContainerName(
        containerName
      );
      const containerPort = await this.getContainerPortByContainerName(
        containerName
      );
      resolve({
        containerID,
        containerIP,
        containerPort,
      });
    });
  }

  async getNginxConfig(root: string, server_name: string, server_url: string) {
    return nginx_main_config
      .replace(/\%SERVER_NAME\%/g, server_name)
      .replace("%SERVER_URL%", server_url);
  }

  close() {
    Deploy.ssh.dispose();
  }
}
