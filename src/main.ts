import * as core from "@actions/core";

import deploy from "./deploy";

async function run() {
  try {
    const args: any = {
      server_ip: core.getInput("server_ip", { required: true }),
      user: core.getInput("user", { required: true }),
      ssh_private_key: core.getInput("ssh_private_key", { required: true }),
      app_host: core.getInput("app_host", { required: true }),

      app_name: core.getInput("app_name", { required: true }),
      source: core.getInput("source") || "dist",
      dockerfile: core.getInput("dockerfile") || null,
      env: core.getInput("env") || "",
      env_name: core.getInput("env_name") || "production",
      static: core.getBooleanInput("static") || false,
      run_command: core.getInput("run_command") || null,
      build_command: core.getInput("build_command") || null,
      wildcard_ssl: core.getBooleanInput("wildcard_ssl", { required: false }) || false,
      repo_token: core.getInput("repo_token") || null,
    };

    await deploy(args);
  } catch (error: any | Error) {
    core.setFailed(error);
  }
}

run();
