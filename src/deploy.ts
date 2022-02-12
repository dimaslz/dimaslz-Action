import * as core from "@actions/core";
import { NodeSSH } from "node-ssh";
import { Deploy } from "./deploy.class";

const { GITHUB_WORKSPACE, GITHUB_SHA } = process.env;

const ssh = new NodeSSH();

export const deploy = async (actionArgs: any) => {
  core.info("🚀 Deploy");

  const TIMESTAMP = new Date().getTime();

  const {
    server_ip: host,
    user: username,
    ssh_private_key: privateKey,
    app_name,
    app_host,
    env_name,
  } = actionArgs;

  const { INPUT_APP_NAME } = process.env;
  core.info(`ℹ️ ${INPUT_APP_NAME}`)

  await ssh.connect({
    host,
    username,
    privateKey,
  });

  core.info("🚀 Deploy: connecting by SSH");
  const deployInstance = Deploy.create(ssh);
  const REPO_ID = await deployInstance.getRepositoryID();
  if (!REPO_ID) {
    core.error(
      "🚀 Deploy: This repository is private, please use repo_token with value ${{ secrets.GITHUB_TOKEN }}"
    );
    deployInstance.close();
    return;
  }

  const ENV = env_name;
  const APP_URL = `${app_name}.${app_host}`;

  core.info(`🚀 Deploy: REPO_ID ${REPO_ID}`);
  const CONTAINER_IDs: any[] = await deployInstance.getContainersIDByAppName(
    `${REPO_ID}.`
  );

  console.log("CONTAINER_IDs", CONTAINER_IDs);

  const IMAGES_IDs: string[] = await deployInstance.getImagesIDByAppName(`${REPO_ID}.`);

  const ENV_APP_NAME = `${REPO_ID}.${APP_URL}.${TIMESTAMP}.${GITHUB_SHA}.${ENV}`;
  const APP_ID = `${TIMESTAMP}.${GITHUB_SHA}`;
  const APP_DIR = `/var/www/${APP_URL}/${ENV}`;

  const NEW_CONTAINER_NAME = `${ENV_APP_NAME}.container`;

  const NEW_IMAGE_NAME = `${ENV_APP_NAME}.image`;
  const NEW_VOLUME_NAME = `${APP_URL}.volume`;

  // APPLICATION DIRECTORY
  core.info("🚀 Deploy: application directory");
  const dirExists = await deployInstance.dirExists(APP_DIR);
  if (!dirExists) {
    await deployInstance.createFolder(APP_DIR);
  }

  core.info("🚀 Deploy: application version directory");
  const APP_ID_DIR = `${APP_DIR}/${APP_ID}`;
  const dirVersionExists = await deployInstance.dirExists(APP_ID_DIR);
  if (!dirVersionExists) {
    await deployInstance.createFolder(APP_ID_DIR);
  }

  // FILES DIRECTORY
  const APP_FILES_DIR = `${APP_ID_DIR}/files`;
  const dirFilesExists = await deployInstance.dirExists(APP_FILES_DIR);
  if (!dirFilesExists) {
    await deployInstance.createFolder(APP_FILES_DIR);
  }

  core.info("🚀 Deploy: uploading files");
  await deployInstance.uploadFiles(`${GITHUB_WORKSPACE}`, APP_FILES_DIR);

  // core.info("🚀 Deploy: setting env vars");
  // await deployInstance.uploadEnvVars(`${APP_DIR}`);

  core.info("🚀 Deploy: setting docker config");
  await deployInstance.uploadDockerfile(APP_ID_DIR);

  core.info("🚀 Deploy: setting docker config");
  await deployInstance.createAndUploadDockerComposeFile(APP_ID_DIR, {
    imageName: NEW_IMAGE_NAME,
    containerName: NEW_CONTAINER_NAME,
    appName: ENV_APP_NAME,
  });


  core.info("🚀 Deploy: creating run image");
  const NEW_IMAGE_ID = await deployInstance.buildImageByDockerCompose(
    APP_ID_DIR,
    NEW_IMAGE_NAME
  );

  core.info(`🚀 Deploy: IMAGE_ID > ${NEW_IMAGE_ID}`);

  // // core.info("🚀 Deploy: creating image");
  // // const NEW_IMAGE_ID = await deployInstance.createImage(
  // //   APP_DIR,
  // //   NEW_IMAGE_NAME
  // // );

  // let NEW_CONTAINER_INFO: any = null;
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
  const NEW_CONTAINER_INFO: any = await deployInstance.runContainer(APP_ID_DIR, {
    container: NEW_CONTAINER_NAME,
    appName: ENV_APP_NAME,
  });

  core.info(`ℹ️ Deploy: container info ${JSON.stringify(NEW_CONTAINER_INFO)}`);
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

  if (CONTAINER_IDs.length) {
    core.info(`🚀 Deploy: Removing old containers... ${CONTAINER_IDs.join(' ')}`);
    await deployInstance.stopContainerByName(CONTAINER_IDs);
  }

  if (IMAGES_IDs.length) {
    core.info(`🚀 Deploy: Removing old images...`);
    await deployInstance.removeImagesByName(IMAGES_IDs);
  }

  // // core.info("🚀 Deploy: delete files");
  // // await deployInstance.deleteFiles(APP_DIR);

  deployInstance.close();
};

export default deploy;
