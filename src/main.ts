import * as core from "@actions/core";
import { exec } from "@actions/exec";

async function run() {
  try {
    const name = core.getInput("name");
    const token = core.getInput("github_token");
    const autounlock = core.getInput("autounlock") === "true";

    core.saveState("lock_name", name);
    core.saveState("autounlock", autounlock.toString());

    let output = "";
    await exec("gh", ["workflow", "lock", "--environment", name, "--repo", process.env.GITHUB_REPOSITORY!], {
      env: {
        ...process.env,
        GH_TOKEN: token
      },
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        }
      }
    });

    core.setOutput("locked", "true");
    core.setOutput("released", "false");
    core.info("🔒 Lock acquired");

  } catch (error) {
    core.setFailed(`❌ Failed to acquire lock: ${error}`);
    core.setOutput("locked", "false");
    core.setOutput("released", "false");
  }
}

run();
