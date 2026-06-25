const { execFile } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: REPO_ROOT }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

/**
 * Stages the site/ folder, commits, and pushes using whatever git
 * identity/SSH credentials are already configured on this machine.
 * Returns { pushed: true } on success, or { pushed: false, reason }
 * if there was nothing to commit or no remote is configured yet.
 */
async function publishToGit(commitMessage) {
  await run('git', ['add', 'site']);

  const { stdout: statusOut } = await run('git', ['status', '--porcelain']);
  if (!statusOut.trim()) {
    return { pushed: false, reason: 'nothing-to-commit' };
  }

  await run('git', ['commit', '-m', commitMessage]);

  try {
    await run('git', ['push']);
  } catch (err) {
    return { pushed: false, reason: 'push-failed', detail: err.stderr || err.message };
  }

  return { pushed: true };
}

module.exports = { publishToGit };
