import * as core from "@actions/core";
import { NodeSSH } from "node-ssh";
import { Deploy } from "./deploy.class";

const { GITHUB_WORKSPACE, GITHUB_SHA } = process.env;

const actionLabel = "[🚀 Deploy]";
const log = {
  info: (text: string) => core.info(`${actionLabel}: ${text}`),
  error: (text: string) => core.error(`${actionLabel}: ${text}`),
  warning: (text: string) => core.warning(`${actionLabel}: ${text}`),
}

const regexIp4 = /(\b25[0-5]|\b2[0-4][0-9]|\b[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}/;

export const deploy = async (actionArgs: any) => {
  log.info("starting...");

  const TIMESTAMP = new Date().getTime();

  const {
    INPUT_APP_NAME = "",
    INPUT_SERVER_IP = "",
    INPUT_APP_HOST = "",
    INPUT_USER = "",
    INPUT_SSH_PRIVATE_KEY = "",
  } = process.env;

  log.info("validating server ip from server_ip...");
  if (!regexIp4.test(INPUT_SERVER_IP)) {
    core.setFailed("Please, check your 'server_ip' parammeter");

    return;
  }
  log.info("Server IP by server_ip parameter is valid 👍");

  log.info("validating application name from app_name...");
  let applicationName: string = INPUT_APP_NAME;
  if (!INPUT_APP_NAME) {
    applicationName = "repo-name-as-default";
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

  const ssh = new NodeSSH();

  await ssh.connect({
    host: INPUT_SERVER_IP,
    username: INPUT_USER,
    privateKey: INPUT_SSH_PRIVATE_KEY,
  });

  log.info("🔌 connecting by SSH");
  const deployInstance = Deploy.create(ssh);

  const REPO_ID = await deployInstance.getRepositoryID();

  console.log("REPO_ID", REPO_ID);
  if (!REPO_ID) {
    log.error(
      "This repository is private, please use repo_token with value ${{ secrets.GITHUB_TOKEN }}"
    );
    deployInstance.close();

    return;
  }

  deployInstance.close();

  return;

  // const ENV = env_name;
  // log.info(`environment > ${ENV}`);

  // const APP_URL = `${app_name}.${app_host}`;
  // log.info(`application url - ${APP_URL}`);

  // log.info(`REPO_ID ${REPO_ID}`);

  // // getting current containers to remove once the new service are running
  // const CONTAINER_IDs: any[] = await deployInstance.getContainersIDByAppName(
  //   `${REPO_ID}.`
  // );

  // // getting current images to remove once the new service are running
  // const IMAGES_IDs: string[] = await deployInstance.getImagesIDByAppName(`${REPO_ID}.`);

  // // base name of instances
  // const ENV_APP_NAME = `${REPO_ID}.${APP_URL}.${TIMESTAMP}.${GITHUB_SHA}.${ENV}`;
  // // application id for this deploy
  // const APP_ID = `${TIMESTAMP}.${GITHUB_SHA}`;
  // // application folder where we will store all files
  // const APP_DIR = `/var/www/${APP_URL}/${ENV}`;

  // const NEW_CONTAINER_NAME = `${ENV_APP_NAME}.container`;
  // const NEW_IMAGE_NAME = `${ENV_APP_NAME}.image`;
  // const NEW_VOLUME_NAME = `${APP_URL}.volume`;

  // // create application directory
  // log.info("application directory");
  // const dirExists = await deployInstance.dirExists(APP_DIR);
  // if (!dirExists) {
  //   await deployInstance.createFolder(APP_DIR);
  // }

  // log.info("application version directory");
  // // one folder per each deploy if it doesn´t exists (after should be cleaned)
  // const APP_ID_DIR = `${APP_DIR}/${APP_ID}`;
  // const dirVersionExists = await deployInstance.dirExists(APP_ID_DIR);
  // if (!dirVersionExists) {
  //   await deployInstance.createFolder(APP_ID_DIR);
  // }

  // // create directory of files if it doesn´t exists
  // const APP_FILES_DIR = `${APP_ID_DIR}/files`;
  // const dirFilesExists = await deployInstance.dirExists(APP_FILES_DIR);
  // if (!dirFilesExists) {
  //   await deployInstance.createFolder(APP_FILES_DIR);
  // }

  // log.info("uploading files");
  // // let's upload files to /files of the application files dir
  // await deployInstance.uploadFiles(`${GITHUB_WORKSPACE}`, APP_FILES_DIR);

  // log.info("setting dockerfile to use");
  // await deployInstance.uploadDockerfile(APP_ID_DIR);

  // log.info("prepare compose to build dockerfile");
  // await deployInstance.createAndUploadDockerComposeFile(APP_ID_DIR, {
  //   imageName: NEW_IMAGE_NAME,
  //   containerName: NEW_CONTAINER_NAME,
  //   appName: ENV_APP_NAME,
  // });

  // log.info("build image");
  // const NEW_IMAGE_ID = await deployInstance.buildImageByDockerCompose(
  //   APP_ID_DIR,
  //   NEW_IMAGE_NAME
  // );
  // log.info(`IMAGE_ID > ${NEW_IMAGE_ID}`);

  // // if the image could not be created, return an error and stop the deploy
  // if (!NEW_IMAGE_ID) {
  //   log.error("no image created");
  //   deployInstance.close();
  //   return;
  // }

  // // create volume to do not lost the data of the application
  // log.info("creating volume");
  // const volumeExists = await deployInstance.volumeExists(NEW_VOLUME_NAME);
  // if (!volumeExists) {
  //   await deployInstance.createVolume(NEW_VOLUME_NAME);
  // }

  // log.info(`running container ${NEW_CONTAINER_NAME}`);
  // const NEW_CONTAINER_INFO: any = await deployInstance.runContainer(APP_ID_DIR, {
  //   container: NEW_CONTAINER_NAME,
  //   appName: ENV_APP_NAME,
  // });

  // // if the container could not be created, return an error and stop the deploy
  // if (!NEW_CONTAINER_INFO.containerID) {
  //   log.error(
  //     "some error has been occurred. Container is not running 😒"
  //   );
  //   deployInstance.close();
  //   return;
  // }
  // log.info("container created succesfully! 😄");

  // // creating nginx config about the application requirements
  // log.info("setting nginx config");
  // let nginxConfig = "";
  // nginxConfig = await deployInstance.getNginxConfig(
  //   `${app_name}.${app_host}`,
  //   `http://${NEW_CONTAINER_INFO.containerIP}:${NEW_CONTAINER_INFO.containerPort}`
  // );

  // if (nginxConfig) {
  //   log.info("test and restarting NGINX");
  //   await deployInstance.uploadNginxConfig(
  //     nginxConfig,
  //     `/etc/nginx/sites-enabled/${APP_URL}`
  //   );
  //   await deployInstance.restartNginx();
  // }
  // log.info(`✅ your application already is running! 🏃‍♂️💨, now try to visit your site https://${APP_URL} in your browser`);
  // log.info(`It is not working? be sure that you domain has the correct DNS setup`);

  // if (CONTAINER_IDs.length) {
  //   log.info(`🧹 removing unnecessary old containers...`);
  //   await deployInstance.stopContainerByName(CONTAINER_IDs);
  // }

  // if (IMAGES_IDs.length) {
  //   log.info(`🧹 removing unnecessary old images...`);
  //   await deployInstance.removeImagesByName(IMAGES_IDs);
  // }

  // // TODO: Remove old files
  // // // core.info("🚀 Deploy: delete files");
  // // // await deployInstance.deleteFiles(APP_DIR);

  // deployInstance.close();

  // log.info(`DONE 👏`);
};

export default deploy;
