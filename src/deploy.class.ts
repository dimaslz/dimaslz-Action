import fetch from "node-fetch";
import * as core from "@actions/core";
import fs from "fs";

import {
  nginx_static_dockerfile,
  node_server_dockerfile,
  nginx_main_config,
  nginx_main_wildcard_config,
  dockerCompose as DockerComposeTpl
} from "./assets";

const {
  GITHUB_WORKSPACE,
  INPUT_DOCKERFILE,
  INPUT_ENV,
  GITHUB_REPOSITORY,
  INPUT_REPO_TOKEN,
  INPUT_RUN_COMMAND = 'yarn start',
  INPUT_STATIC = "false",
  INPUT_WILDCARD_SSL = "false",
  INPUT_APP_HOST = "",
  INPUT_APP_PORTS = "80",
} = process.env;

const toBoolean = (value: string | boolean) => {
  if (typeof value === "boolean") return value;

  const isTrue = value.toLowerCase() === "true";
  const isFalse = value.toLowerCase() === "false";

  return isFalse ? false : isTrue;
}

export class Deploy {
  private static instance: Deploy;
  private static ssh: any;

  private constructor() {}

  static create(ssh: any): Deploy {
    if (!Deploy.instance && ssh) {
      Deploy.ssh = ssh;
      Deploy.instance = new Deploy();
    }

    return Deploy.instance;
  }

  async getRepositoryID() {
    const [owner, repo] = GITHUB_REPOSITORY?.split("/") || [];
    if (!owner || !repo) return null;

    const headers: any = {
      "Accept": "application/vnd.github.v3+json",
    };
    if (INPUT_REPO_TOKEN) {
      headers["Authorization"] = `token ${INPUT_REPO_TOKEN}`;
    }

    const data = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
    }).then(async(r: any) => r.json());

    return data?.id;
  }

  async getContainersIDByAppName(name: string): Promise<string[]> {
    console.log("getContainersIDByAppName [app]", name)

    return new Promise((resolve, reject) => {
      const command = `docker ps --format="{{.Names}} {{.ID}}" | grep '${name}' | grep -Po '_(.*?)_'`;

      console.log("getContainersIDByAppName [command]", command)
      Deploy.ssh
        .execCommand(command)
        .then((result: any) => {
          // if (result.stderr) {
          //   this.close();
          //   reject(result.stderr);
          // }

          console.log("getContainersIDByAppName [result.stdout]", result.stdout)
          const r = result.stdout
            .split(/\n/gm)
            .map((c: any) => c.replace(/^_|_$/g, ''))
            .filter((i: string) => i)

          console.log("getContainersIDByAppName [r]", r)

          resolve(r);
        }).catch((err: any) => {
          this.close();
          reject(err);
        });
    });
  }

  async getImagesIDByAppName(name: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      Deploy.ssh
        .execCommand(
          `docker images --format="{{.Repository}}" | grep '${name}'`
        )
        .then((result: any) => {
          // if (result.stderr) {
          //   this.close();
          //   reject(result.stderr);
          // }

          resolve(result.stdout.split(/\n/gm).filter((i: string) => i));
        }).catch((err: any) => {
          this.close();
          reject(err);
        });
    });
  }

  async createFolder(dir: string) {
    return new Promise((resolve, reject) => {
      Deploy.ssh.execCommand(`mkdir -p ${dir}`).then((result: any) => {
        if (result.stderr) {
          console.log("[LOG]: result.stderr", result.stderr);
          this.close();
          reject(result.stderr);
        }

        console.log("[LOG]: dir", dir);
        resolve(dir);
      });
    });
  }

  async dirExists(dir: string) {
    return new Promise((resolve, reject) => {
      const command = `if [ -d "${dir}" ]; then echo "true"; else echo "false"; fi`;
      Deploy.ssh.execCommand(command).then((result: any) => {
        if (result.stderr) {
          this.close();
          reject(result.stderr);
        }

        resolve(JSON.parse(result.stdout));
      });
    });
  }


  async deleteFiles(remote: string) {
    const command = `rm -Rf ${remote}`;
    await Deploy.ssh.execCommand(command);
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

            if (failed.length) {
              console.log("failed transfers", failed.join(", "));
            } else {
              console.log("successful transfers");
            }

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

  async buildImageByDockerCompose(remote: string, imageName: string) {
    let command = `docker-compose -f ${remote}/docker-compose.yml build`;
    console.log("docker build command", command);

    return new Promise(async (resolve, reject) => {
      try {
        await Deploy.ssh.execCommand(command).then(async (result: any) => {
          console.log("result.stderr", result.stderr)
          console.log("result.stdout", result.stdout)
          // if (result.stderr) {
          //   this.close();
          //   reject(result.stderr);
          // }

          const imageId: string = await this.getImageIDByImageName(imageName);
          if (imageId) {
            return resolve(imageId);
          }

          reject(null);
        });
      } catch (err) {
        console.log("errerr", err)
        reject(null);
        this.close();
      }
    });
  }

  async runContainerByDockerCompose(remote: string, { appName }: any) {
    const command = `docker-compose run ${appName} `;

    return new Promise(async (resolve, reject) => {
      try {
        await Deploy.ssh.execCommand(command).then((result: any) => {
          if (result.stderr) {
            this.close();
            reject(result.stderr);
          }

          resolve(null);
        });
      } catch {
        this.close();
      }
    });
  }

  async createAndUploadDockerComposeFile(remote: string, {
    imageName,
    containerName,
    appName
  }: any) {
    let dockerComposeConfig = DockerComposeTpl

    dockerComposeConfig = dockerComposeConfig
      .replace("%SERVICE_NAME%", appName)
      .replace("%IMAGE_NAME%", imageName)
      .replace("%CONTAINER_NAME%", containerName);

    if (INPUT_DOCKERFILE) {
      const path = INPUT_DOCKERFILE.split("/") as any;
      const dockerfileName = path.pop();

      dockerComposeConfig = dockerComposeConfig
        .replace("%DOCKERFILE_FILE_CONTEXT%", `./files/${path.join("/")}`)
        .replace("%DOCKERFILE_FILE_NAME%", dockerfileName);
    } else {
      dockerComposeConfig = dockerComposeConfig
      .replace("%DOCKERFILE_FILE_CONTEXT%", "./")
      .replace("%DOCKERFILE_FILE_NAME%", "Dockerfile");
    }

    const APP_PORTS = INPUT_APP_PORTS || "80"
    if (APP_PORTS) {
      const [portLine] = dockerComposeConfig.match(/^.*?-\s\%PORT\%/mg) || [];
      const PORTS = APP_PORTS.split(',')
        .map(e => e.trim())
        .map(e => (
          portLine.replace('%PORT%', `${e}`)
        ))
        .join('\n');

      dockerComposeConfig = dockerComposeConfig
        .replace(/^.*?-\s\%PORT\%/mg, PORTS)
    }

    if (INPUT_ENV) {
      const [environmentLine] = dockerComposeConfig.match(/^.*?-\s\%ENVIRONMENT\%/mg) || [];
      if (environmentLine) {
        const ENV_VARS = INPUT_ENV?.split(/\n/)
          .filter(e => e)
          .map((e) => (
            environmentLine.replace('%ENVIRONMENT%', `${e}`)
          ))
          .join('\n');

        dockerComposeConfig = dockerComposeConfig
          .replace(/^.*?-\s\%ENVIRONMENT\%/mg, ENV_VARS)
      }

      const [argLine] = dockerComposeConfig.match(/^.*?-\s\%ARGS\%/mg) || [];
      if (argLine) {
        const ARGS_VARS = INPUT_ENV?.split(/\n/)
          .filter(e => e)
          .map((e) => (
            argLine.replace('%ARGS%', `${e}`)
          ))
          .join('\n');

        dockerComposeConfig = dockerComposeConfig
          .replace(/^.*?-\s\%ARGS\%/mg, ARGS_VARS)
      }
    }

    fs.writeFileSync(
      `${GITHUB_WORKSPACE}/docker-compose.yml`,
      dockerComposeConfig
    );

    return new Promise((resolve, reject) => {
      Deploy.ssh
        .putFile(`${GITHUB_WORKSPACE}/docker-compose.yml`, `${remote}/docker-compose.yml`)
        .then(
          () => {
            console.log("The docker-compose config is done");
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
    let Dockerfile = toBoolean(INPUT_STATIC)
      ? nginx_static_dockerfile
      : node_server_dockerfile.replace("$COMMAND", INPUT_RUN_COMMAND)

    let ENVIRONMENT_VARS = ""
    if (INPUT_ENV) {
      ENVIRONMENT_VARS = INPUT_ENV?.split(/\n/)
        .filter(e => e)
        .map(e => e.trim())
        .map(e => {
          const [name] = e.split('=');
          return `ARG ${name}\nENV ${name} $${name}`
        })
        .join("\n");
    }

    Dockerfile = Dockerfile.replace("%ENVIRONMENT_VARS%", ENVIRONMENT_VARS);

    core.info(`Dockerfile: ${Dockerfile}`);
    fs.writeFileSync(
      `${GITHUB_WORKSPACE}/Dockerfile`,
      Dockerfile
    );

    return new Promise((resolve, reject) => {
      Deploy.ssh
        .putFile(`${GITHUB_WORKSPACE}/Dockerfile`, `${remote}/Dockerfile`)
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

    let envVars = "";
    if (INPUT_ENV) {
      envVars = INPUT_ENV?.split(/\n/)
        .filter(e => e)
        .map(e => `--build-arg ${e}`)
        .join(" ");
    }

    let command = `cd ${appDir} && docker build --no-cache -t ${imageName} ${envVars}`;

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

      console.log("getImageIDByImageName [command]", command);

      Deploy.ssh.execCommand(command).then((result: any) => {
        console.log("getContainerIDByContainerName [result.stderr]", result.stderr);
        console.log("getContainerIDByContainerName [result.stdout]", result.stdout);
        if (result.stderr) {
          this.close();
          reject(result.stderr);
        }

        resolve(result.stdout);
      }).catch((err: any) => {
        this.close();
        console.log("getContainerIDByContainerName [err]")
        reject(err);
      });
    });
  }

  async getContainerIPByContainerId(containerId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = `docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${containerId}`;

      Deploy.ssh.execCommand(command).then((result: any) => {
        // if (result.stderr) {
        //   this.close();
        //   reject(result.stderr);
        // }

        resolve(result.stdout);
      }).catch((err: any) => {
          this.close();
          reject(err);
      });
    });
  }

  async getContainerPortByContainerName(
    containerId: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = `docker container ls | grep '${containerId}' | grep -Po '\\d+\/tcp' | grep -Po '\\d+'`;

      Deploy.ssh.execCommand(command).then((result: any) => {
        // if (result.stderr) {
        //   this.close();
        //   reject(result.stderr);
        // }

        resolve(result.stdout);
      }).catch((err: any) => {
        this.close();
        reject(err);
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

  async stopContainerByName(appName: string[]): Promise<boolean> {
    console.log("stopContainerByName [appName]", appName)
    const stop = async (app: string) => {
      return new Promise((resolve, reject) => {
        const command = `docker-compose -f docker-compose-files/${app}-docker-compose.yml down`;

        console.log("stopContainerByName [command]", command)
        Deploy.ssh.execCommand(command).then(() => {
          // if (result.stderr) {
          //   core.error(result.stderr);
          //   this.close();
          //   reject(false);
          // }

          resolve(true);
        }).catch((err: any) => {
          core.error(err);
          this.close();
          reject(false);
        });
      });
    };

    if (!appName.length) {
      core.error(`Container name/id is mandatory.`);
      return false;
    }

    const arrContainerIDs = appName;
    const isSingle = arrContainerIDs.length === 1;

    console.log("stopContainerByName [isSingle]", isSingle)
    if (isSingle) {
      const exists = await this.containerExists(appName[0]);

      console.log("stopContainerByName [exists]", exists)
      if (exists) {
        await stop(appName[0]);
        core.info(`Container ${appName[0]} has been stopped.`);

        return true;
      }

      core.error(`Container ${appName[0]} doesn't exists.`);
    } else if (!isSingle) {
      for (const containerID of arrContainerIDs) {
        const stopped = await stop(containerID);
        if (stopped) {
          core.info(`Container ${containerID} has been stopped.`);
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

  async removeImagesByName(imageId: string[]): Promise<boolean> {
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

    if (!imageId.length) {
      core.error(`Image id is mandatory.`);
      return false;
    }

    const arrImageIDs = imageId;
    const isSingle = arrImageIDs.length === 1;
    if (isSingle) {
      const exists = await this.imageExists(imageId[0]);

      if (exists) {
        await remove(imageId[0]);
        core.info(`Image ${imageId[0]} has been deleted.`);

        return true;
      }

      core.error(`Image ${imageId[0]} doesn't exists.`);
    } else if (!isSingle) {
      for (const imageID of arrImageIDs) {
        const removed = await remove(imageID);
        if (removed) {
          core.info(`Image ${imageID} has been deleted.`);
        } else {
          core.error(`Image ${imageID} not deleted.`);
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

  async runContainer(remote: string, {
    container,
    appName
  }: any) {
    console.log(`Running container ${container}`);
    return new Promise(async (resolve, reject) => {
      // const command = `docker run --name ${containerName} -v ${volumeName}:/app -d ${imageName}`;
      // let envFileCmd = "";
      // if (INPUT_ENV) {
      //   envFileCmd = `--env-file ${appDir}/.__env`;
      // }

      const command = `docker-compose -f ${remote}/docker-compose.yml run -d ${appName}`

      await Deploy.ssh.execCommand(command);

      const containerID = await this.getContainerIDByContainerName(
        appName
      );

      console.log("runContainer [containerID]", containerID)

      if (!containerID) reject(null);

      const containerIP = await this.getContainerIPByContainerId(
        containerID
      );
      console.log("runContainer [containerIP]", containerIP)

      const containerPort = await this.getContainerPortByContainerName(
        containerID
      );
      console.log("runContainer [containerPort]", containerPort)

      resolve({
        containerID,
        containerIP,
        containerPort,
      });
    });
  }

  async getNginxConfig(server_name: string, server_url: string) {
    if (toBoolean(INPUT_WILDCARD_SSL)) {
      nginx_main_wildcard_config
        .replace(/\%DOMAIN\%/g, INPUT_APP_HOST)
        .replace(/\%SERVER_NAME\%/g, server_name)
        .replace("%SERVER_URL%", server_url);
    }

    return nginx_main_config
      .replace(/\%SERVER_NAME\%/g, server_name)
      .replace("%SERVER_URL%", server_url);
  }

  close() {
    Deploy.ssh.dispose();
  }
}
