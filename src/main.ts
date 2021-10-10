import * as core from "@actions/core";

import deploy from "./deploy"

const { INPUT_APP_NAME } = process.env;

async function run() {
  try {
		const args: any = {
			server_ip: core.getInput("server_ip", { required: true }),
			user: core.getInput("user", { required: true }),
			ssh_private_key: core.getInput("ssh_private_key", { required: true }),
			app_host: core.getInput("app_host", { required: true }),

			app_name: core.getInput("app_name") || INPUT_APP_NAME,
			source: core.getInput("source") || 'dist',
			dockerfile: core.getInput("dockerfile"),
			env: core.getInput("env"),
    };

		await deploy(args);
  }
  catch (error: any | Error) {
    core.setFailed(error);
  }
}

run();
