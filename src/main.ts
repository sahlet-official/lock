import * as core from '@actions/core';
import * as github from '@actions/github';

type OctokitType = ReturnType<typeof github.getOctokit>;

const LOCK_PREFIX = 'tmp_lock_branch_';
const LOCK_FILE = 'tmp_lock_file_123456.json';

type LockInfo = {
  name: string;
  created_at: string;
  created_by: string;
  run_id: number;
  run_url: string;
};

async function getLockInfo(
  lockBranch: string,
  octokit: OctokitType,
  owner: string,
  repo: string
): Promise<LockInfo> {
  const refData = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${lockBranch}`,
  });

  const commitSha = refData.data.object.sha;

  const commit = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: commitSha,
  });

  const treeSha = commit.data.tree.sha;

  const tree = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: treeSha,
    recursive: 'true',
  });

  const lockFile = tree.data.tree.find((item) => item.path === LOCK_FILE && item.type === 'blob');

  if (!lockFile || !lockFile.sha) {
    throw new Error(`Lock file "${LOCK_FILE}" not found in branch "${lockBranch}"`);
  }

  const blob = await octokit.rest.git.getBlob({
    owner,
    repo,
    file_sha: lockFile.sha,
  });

  const content = Buffer.from(blob.data.content, 'base64').toString('utf-8');

  const parsed: LockInfo = JSON.parse(content);

  return parsed;
}

async function printLockInfo(lockBranch: string, octokit: OctokitType, owner: string, repo: string, name: string) {
  try {
    const lockInfo = await getLockInfo(lockBranch, octokit, owner, repo);
    core.info(`❌🔒 Lock "${name}" already acquired, \ninfo: ${JSON.stringify(lockInfo, null, 2)}`);
  } catch {
    core.info(`❌🔒 Lock "${name}" already acquired`);
  }
}


async function run() {
  const token = core.getInput('github_token', { required: true });
  const name = core.getInput('name', { required: true });
  const mode = core.getInput('mode') || 'lock';
  const auto_unlock = core.getBooleanInput('auto_unlock');
  const fail_if_cant_lock = core.getBooleanInput('fail_if_cant_lock');
  const fail_if_cant_unlock = core.getBooleanInput('fail_if_cant_unlock');

  const octokit = github.getOctokit(token);
  const { repo, owner } = github.context.repo;
  const lockBranch = `${LOCK_PREFIX}${name}`;

  if (mode === 'lock') {
    core.setOutput('released', false);
    try {
      // Try to get the lock branch
      await octokit.rest.repos.getBranch({ owner, repo, branch: lockBranch });
      core.setOutput('locked', false);
      await printLockInfo(lockBranch, octokit, owner, repo, name);
      if (fail_if_cant_lock) {
        core.setFailed("cant lock");
      }
    } catch (error: any) {
      if (error.status === 404) {
        const base = github.context.ref.replace('refs/heads/', '');
        const { data: baseRef } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${base}` });

        // Create lock metadata
        const lockData = {
          name: name,
          created_at: new Date().toISOString(),
          created_by: github.context.actor,
          run_id: github.context.runId,
          run_url: `https://github.com/${owner}/${repo}/actions/runs/${github.context.runId}`,
        };

        const blob = await octokit.rest.git.createBlob({
          owner,
          repo,
          content: JSON.stringify(lockData, null, 2),
          encoding: 'utf-8',
        });

        const tree = await octokit.rest.git.createTree({
          owner,
          repo,
          base_tree: baseRef.object.sha,
          tree: [
            {
              path: LOCK_FILE,
              mode: '100644',
              type: 'blob',
              sha: blob.data.sha,
            },
          ],
        });

        const commit = await octokit.rest.git.createCommit({
          owner,
          repo,
          message: `🔒 Lock "${name}" created by ${github.context.actor}`,
          tree: tree.data.sha,
          parents: [baseRef.object.sha],
        });

        try {
          await octokit.rest.git.createRef({
            owner,
            repo,
            ref: `refs/heads/${lockBranch}`,
            sha: commit.data.sha,
          });
        } catch (error: any) {
          if (error.status === 422 && error.message.includes('Reference already exists')) {
            core.setOutput('locked', false);
            await printLockInfo(lockBranch, octokit, owner, repo, name);
            if (fail_if_cant_lock) {
              core.setFailed("cant lock");
            }
          } else {
            throw error;
          }
        }

        core.setOutput('locked', true);
        core.info(`✅🔒 Lock "${name}" acquired`);
      } else {
        throw error;
      }
    }
  } else if (mode === 'unlock') {
    core.setOutput('locked', false);
    try {
      await octokit.rest.git.deleteRef({ owner, repo, ref: `heads/${lockBranch}` });
      core.setOutput('released', true);
      core.info(`🔓 Lock "${name}" released`);
    } catch (err: any) {
      if (err.status === 422) {
        const message = `Lock "${name}" was already released or not found.`;
        if (fail_if_cant_unlock) {
          core.setFailed(message);
        }
        else {
          core.info(message);
        }
      } else {
        throw err;
      }
      core.setOutput('released', false);
    }
  }
}

run().catch((err) => core.setFailed(err.stack ? `${err.message}\n${err.stack}` : err.message));