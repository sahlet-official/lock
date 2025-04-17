import * as core from '@actions/core';
import * as github from '@actions/github';

const LOCK_PREFIX = 'tmp_lock_branch_';

async function run() {
  const token = core.getInput('github_token', { required: true });
  const name = core.getInput('name', { required: true });
  const autounlock = core.getBooleanInput('autounlock');

  const locked = core.getBooleanInput('locked');

  const octokit = github.getOctokit(token);
  const { repo, owner } = github.context.repo;
  const lockBranch = `${LOCK_PREFIX}${name}`;

  if (autounlock && locked) {
    core.info(`🔁 Releasing lock "${name}"...`);
    try {
      await octokit.rest.git.deleteRef({ owner, repo, ref: `heads/${lockBranch}` });
      core.info(`🔓 Lock "${name}" released`);
    } catch (err: any) {
      if (err.status === 422) {
        core.info(`Lock "${name}" was already released or not found.`);
      } else {
        throw err;
      }
    }
  } else {
    core.info(`No unlock performed.`);
  }
}

run().catch((err) => core.setFailed(err.stack || err.message));
