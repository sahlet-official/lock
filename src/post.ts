import * as core from "@actions/core";
import { exec } from "@actions/exec";

async function run() {
  try {
    const name = core.getState("lock_name");
    const autounlock = core.getState("autounlock") === "true";
    if (!autounlock) {
      core.info("🟡 autounlock is disabled, skipping unlock");
      return;
    }

    core.info("Releasing lock...");
    await exec("gh", ["workflow", "unlock", "--environment", name, "--repo", process.env.GITHUB_REPOSITORY!], {
      env: {
        ...process.env,
        GH_TOKEN: process.env.GITHUB_TOKEN || ""
      }
    });

    core.info("🔓 Lock released");
  } catch (error) {
    core.warning(`⚠️ Failed to release lock: ${error}`);
  }
}

run();
