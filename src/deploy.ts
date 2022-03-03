import * as core from "@actions/core";
import { NodeSSH } from "node-ssh";
import { Deploy } from "./deploy.class";

const { GITHUB_WORKSPACE, GITHUB_SHA = "", GITHUB_REPOSITORY } = process.env;

const actionLabel = "[🚀 Deploy]";
const log = {
  info: (text: string) => core.info(`${actionLabel}: ${text}`),
  error: (text: string) => core.error(`${actionLabel}: ${text}`),
  warning: (text: string) => core.warning(`${actionLabel}: ${text}`),
}

const regexIp4 = /(\b25[0-5]|\b2[0-4][0-9]|\b[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}/;

export const deploy = async (actionArgs?: any) => {
  log.info("starting...");

  const TIMESTAMP = new Date().getTime();

  const {
    INPUT_APP_NAME = "",
    INPUT_SERVER_IP = "",
    INPUT_APP_HOST = "",
    INPUT_USER = "",
    INPUT_SSH_PRIVATE_KEY = "",
    INPUT_ENV_NAME = "",
  } = process.env;

  /**
   * CHECK MAIN MANDATORY PARAMMETERS
   * server_ip, user, app_host, ssh_private_key,app
   */

  log.info("validating server ip from server_ip...");
  if (!regexIp4.test(INPUT_SERVER_IP)) {
    core.setFailed("Please, check your 'server_ip' parammeter");

    return;
  }
  log.info("Server IP by server_ip parameter is valid 👍");

  log.info("validating application name from app_name...");
  let applicationName: string = INPUT_APP_NAME;
  if (!INPUT_APP_NAME) {
    const [, defaultAppName] = GITHUB_REPOSITORY?.split("/") || [];
    applicationName = defaultAppName;
  }

  const applicationNameRegex = /^[a-zA-Z0-9-]+$/
  if (!applicationNameRegex.test(applicationName)) {
    core.setFailed("Application name by parammeter 'app_name' should be valid. Check the doc https://fito-deploy.dimaslz.dev/docs/...");

    return;
  }
  log.info("Application name by app_name parammeter is valid 👍");

  log.info("validating application host from app_host...");
  const domainRegex = /^(?!-)[A-Za-z0-9-]+\.[A-Za-z]{2,10}$/;
  if (!domainRegex.test(INPUT_APP_HOST)) {
    core.setFailed("Application host parammeter 'app_host' should be valid. Check the doc https://fito-deploy.dimaslz.dev/docs/...");

    return;
  }
  log.info("Application host by app_host parammeter is valid 👍");


  /**
   * CONNNECT BY SSH
   */
  const ssh = new NodeSSH();

  await ssh.connect({
    host: INPUT_SERVER_IP,
    username: INPUT_USER,
    privateKey: INPUT_SSH_PRIVATE_KEY,
  });

  log.info("🔌 connecting by SSH");
  const deployInstance = Deploy.create(ssh);

  const REPO_ID = await deployInstance.getRepositoryID();
  if (!REPO_ID) {
    core.setFailed(
      "This repository is private, please use repo_token with value ${{ secrets.GITHUB_TOKEN }}"
    );
    deployInstance.close();

    return;
  }
  log.info(`REPO_ID > ${REPO_ID}`);

  const ENV = INPUT_ENV_NAME || "production";
  log.info(`environment > ${ENV}`);

  const APP_URL = `${applicationName}.${INPUT_APP_HOST}`;

  /**
   * GETTING CURRENT CONTAINERS
   * get current container to remove after create the new one
   */
  log.info("getting current containers ID's related to the application name");
  const CONTAINER_IDs: any[] = await deployInstance.getContainersIDByAppName(
    `${REPO_ID}.`
  );

  if (CONTAINER_IDs.length) {
    log.info(`CONTAINER_IDs: ${CONTAINER_IDs.map(c => c.id).join(", ")}`);
  } else {
    log.info("No containers related to this application");
  }

  /**
   * GETTING CURRENT IMAGES
   * get current images to remove after create the new one
   */
  log.info("getting current images ID's related to the application name");
  const IMAGES_IDs: any[] = await deployInstance.getImagesIDByAppName(`${REPO_ID}.`);

  if (IMAGES_IDs.length) {
    log.info(`IMAGES_IDs: ${IMAGES_IDs.map(c => c.id).join(", ")}`);
  } else {
    log.info("No images related to this application");
  }

  /**
   * SETUP USEFUL VARIABLES TO WORK
   */
  // base name of instances
  const shortSHA = GITHUB_SHA.slice(0, 8);
  const ENV_APP_NAME = `${REPO_ID}.${APP_URL}.${TIMESTAMP}.${shortSHA}.${ENV}`;
  // application id for this deploy
  const APP_ID = `${TIMESTAMP}.${shortSHA}`;
  // application folder where we will store all files
  const APP_DIR = `/var/www/${APP_URL}/${ENV}`;

  const NEW_CONTAINER_NAME = `${ENV_APP_NAME}.container`;
  const NEW_IMAGE_NAME = `${ENV_APP_NAME}.image`;
  const NEW_VOLUME_NAME = `${APP_URL}.volume`;


  /**
   * CREATE APPLICATION DIRECTORY
   */
  log.info("creating application directory 👋");
  const dirExists = await deployInstance.dirExists(APP_DIR);
  if (!dirExists) {
    await deployInstance.createFolder(APP_DIR);
    log.info("creating application directory > created! 👍");
  } else {
    log.info("creating application directory > already exists! 👍");
  }

  /**
   * CREATE APPLICATION VERSION DIRECTORY
   * one folder per each deploy if it doesn´t exists (after should be cleaned)
   */
  log.info("creating application version directory 👋");
  const APP_ID_DIR = `${APP_DIR}/${APP_ID}`;
  const dirVersionExists = await deployInstance.dirExists(APP_ID_DIR);
  if (!dirVersionExists) {
    await deployInstance.createFolder(APP_ID_DIR);
    log.info("creating application version directory > created! 👍");
  } else {
    log.info("creating application version directory > already exists! 👍");
  }

  /**
   * CREATE APPLICATION FILES DIRECTORY
   * create directory of files if it doesn´t exists
   */
  const APP_FILES_DIR = `${APP_ID_DIR}/files`;
  const dirFilesExists = await deployInstance.dirExists(APP_FILES_DIR);
  log.info("creating application files directory 👋");
  if (!dirFilesExists) {
    await deployInstance.createFolder(APP_FILES_DIR);
    log.info("creating application files directory > created! 👍");
  } else {
    log.info("creating application files directory > already exists! 👍");
  }

  /**
   * UPLOADING FILES
   * upload files to the /files directory of the application
   */
  log.info("uploading files 👋");
  await deployInstance.uploadFiles(`${GITHUB_WORKSPACE}`, APP_FILES_DIR);
  log.info("uploading files > uploaded! 👍");

  /**
   * CREATING DOCKERFILE
   */
  log.info("setting dockerfile to use");
  await deployInstance.uploadDockerfile(APP_ID_DIR);
  log.info("setting dockerfile to use > done! 👍");

  /**
   * PREPARE DOCKER COMPOSE
   */
  log.info("prepare compose to build dockerfile");
  await deployInstance.createAndUploadDockerComposeFile(APP_ID_DIR, {
    imageName: NEW_IMAGE_NAME,
    containerName: NEW_CONTAINER_NAME,
    appName: ENV_APP_NAME,
  });
  log.info("prepare compose to build dockerfile > done! 👍");

  /**
   * BUILD IMAGE
   */

  log.info("build image");
  let NEW_IMAGE_ID = null
  try {
    NEW_IMAGE_ID = await deployInstance.buildImageByDockerCompose(
      APP_ID_DIR,
      NEW_IMAGE_NAME
    );
    log.info(`image built!: image id > ${NEW_IMAGE_ID}`);

    // if the image could not be created, return an error and stop the deploy
    if (!NEW_IMAGE_ID) {
      core.setFailed("image could not be created.")
      deployInstance.close();

      return;
    }
  } catch (error: any) {
    core.setFailed(error)
    deployInstance.close();

    return;
  }

  /**
   * CREATE VOLUME
   */
  // create volume to do not lost the data of the application
  log.info("creating volume");
  const volumeExists = await deployInstance.volumeExists(NEW_VOLUME_NAME);
  if (!volumeExists) {
    await deployInstance.createVolume(NEW_VOLUME_NAME);
  }
  log.info("creating volume > created! 👍");

  /**
   * RUNNING CONTAINER
   */
  let NEW_CONTAINER_INFO: any = null
  try {
    log.info(`running container ${NEW_CONTAINER_NAME}`);
    NEW_CONTAINER_INFO = await deployInstance.runContainer(
      APP_ID_DIR, { appName: ENV_APP_NAME }
    );

    // if the container could not be created, return an error and stop the deploy
    if (!NEW_CONTAINER_INFO.containerID) {
      core.setFailed(
        "some error has been occurred. Container is not running 😒"
      );
      deployInstance.close();

      return;
    }
    log.info("container ${NEW_CONTAINER_NAME} created succesfully! 😄");
    log.info(`running container ${NEW_CONTAINER_NAME}`);
  } catch (error: any) {
    core.setFailed(error);
  }


  /**
   * RESTART NGINX
   * creating nginx config about the application requirements
   */
  log.info("setting nginx config");
  let nginxConfig = "";
  nginxConfig = await deployInstance.getNginxConfig(
    `${INPUT_APP_NAME}.${INPUT_APP_HOST}`,
    `http://${NEW_CONTAINER_INFO.containerIP}:${NEW_CONTAINER_INFO.containerPort}`
  );

  try {
    if (nginxConfig) {
      log.info("test and restarting NGINX");
      await deployInstance.uploadNginxConfig(
        nginxConfig,
        `/etc/nginx/sites-enabled/${APP_URL}`
      );
      await deployInstance.restartNginx();
    }

    log.info(`✅ your application already is running! 🏃‍♂️💨, now try to visit your site https://${APP_URL} in your browser`);
    log.info(`It is not working? be sure that you domain has the correct DNS setup`);
  } catch (error: any) {
    core.setFailed(error);
  }

  /**
   * STOP PREVIOUS CONTAINERS
   */
  try {
    if (CONTAINER_IDs.length) {
      log.info(`🧹 removing unnecessary old containers...`);
      await deployInstance.stopContainerByName(CONTAINER_IDs);
    }
  } catch (error: any) {
    core.setFailed(error);
  }

  /**
   * STOP PREVIOUS IMAGES
   */
  try {
    if (IMAGES_IDs.length) {
      log.info(`🧹 removing unnecessary old images...`);
      await deployInstance.removeImagesByName(IMAGES_IDs);
    }
  } catch (error: any) {
    core.setFailed(error);
  }

  // TODO: Remove old files
  // // core.info("🚀 Deploy: delete files");
  // // await deployInstance.deleteFiles(APP_DIR);

  deployInstance.close();

  log.info(`DONE 👏`);
  return;
};

export default deploy;
