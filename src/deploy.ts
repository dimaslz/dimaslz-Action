import * as core from "@actions/core";
import { NodeSSH } from "node-ssh";
import { Deploy } from "./deploy.class";

const { GITHUB_WORKSPACE, GITHUB_SHA } = process.env;

const ssh = new NodeSSH();

export const deploy = async ({
  server_ip,
  user,
  ssh_private_key,
  ...rest
}: any) => {
  core.info("🚀 Deploy");

  const TIMESTAMP = new Date().getTime();

  await ssh.connect({
    host: server_ip,
    username: user,
    privateKey: ssh_private_key,
  });

  core.info("🚀 Deploy: connecting by SSH");
  const deployInstance = Deploy.create(ssh);

  const { app_name, app_host } = rest;

  const ENV = "production";
  const APP_URL = `${app_name}.${app_host}`;
  const CONTAINER_IDs = await deployInstance.getContainersIDByAppName(
    `${app_name}.${app_host}`
  );

  const IMAGES_IDs = await deployInstance.getImagesIDByAppName(app_name);
  const BASE_APP_NAME = `${APP_URL}.${TIMESTAMP}.${GITHUB_SHA}`;
  const ENV_APP_NAME = `${APP_URL}.${TIMESTAMP}.${GITHUB_SHA}.${ENV}`;
  const APP_DIR = `/var/www/${APP_URL}/${ENV}`;

  const NEW_CONTAINER_NAME = `${ENV_APP_NAME}.container`;
  // appname.host.timestamp.github-sha.env.image
  const NEW_IMAGE_NAME = `${ENV_APP_NAME}.image`;
  const NEW_VOLUME_NAME = `${APP_URL}.volume`;

  core.info("🚀 Deploy: application directory");
  const dirExists = await deployInstance.appDirExists(APP_DIR);
  if (!dirExists) {
    await deployInstance.createAppFolder(APP_DIR);
  }

  core.info("🚀 Deploy: uploading files");
  await deployInstance.uploadFiles(`${GITHUB_WORKSPACE}`, APP_DIR);

  core.info("🚀 Deploy: setting env vars");
  await deployInstance.uploadEnvVars(`${APP_DIR}`);

  core.info("🚀 Deploy: setting docker config");
  await deployInstance.uploadDockerfile(`${APP_DIR}`);

  core.info("🚀 Deploy: creating image");
  const NEW_IMAGE_ID = await deployInstance.createImage(
    APP_DIR,
    NEW_IMAGE_NAME
  );

  let NEW_CONTAINER_INFO: any = null;
  if (!NEW_IMAGE_ID) {
    core.error("🚀 Deploy: no image created");
    deployInstance.close();
    return;
  }

  const volumeExists = await deployInstance.volumeExists(NEW_VOLUME_NAME);
  if (!volumeExists) {
    await deployInstance.createVolume(NEW_VOLUME_NAME);
  }

  core.info("🚀 Deploy: running container");
  NEW_CONTAINER_INFO = await deployInstance.runContainer(
    NEW_IMAGE_NAME,
    NEW_CONTAINER_NAME,
    NEW_VOLUME_NAME,
    APP_DIR
  );

  if (!NEW_CONTAINER_INFO.containerID) {
    core.error(
      "🚀 Deploy: some error has been occurred. Container is not running"
    );
    deployInstance.close();
    return;
  }
  let nginxConfig = "";
  core.info("🚀 Deploy: container created");

  core.info("🚀 Deploy: setting nginx config");
  nginxConfig = await deployInstance.getNginxConfig(
    `${APP_DIR}/dist`,
    `${app_name}.${app_host}`,
    `http://${NEW_CONTAINER_INFO.containerIP}:${NEW_CONTAINER_INFO.containerPort}`
  );

  if (nginxConfig) {
    core.info("🚀 Deploy: test and restarting NGINX");
    await deployInstance.uploadNginxConfig(
      nginxConfig,
      `/etc/nginx/sites-enabled/${APP_URL}`
    );
    await deployInstance.restartNginx();
  }

  if (!!CONTAINER_IDs) {
    core.info(`🚀 Deploy: Removing old containers...`);
    await deployInstance.stopContainerByName(CONTAINER_IDs);

    core.info(`🚀 Deploy: Removing old images...`);
    await deployInstance.removeImagesByName(IMAGES_IDs);
  }

  deployInstance.close();
};

export default deploy;
