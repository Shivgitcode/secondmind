import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
function git(args, cwd) {
    try {
        return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    }
    catch {
        return ''; // not a repo, or no git — both fine, we fall back to the folder name
    }
}
/**
 * Work out which project you are in, so nobody has to configure anything.
 * Prefers the git remote name, falls back to the repo root, then the folder.
 */
export function detectProject(cwd = process.cwd()) {
    const root = git(['rev-parse', '--show-toplevel'], cwd);
    const remote = git(['config', '--get', 'remote.origin.url'], cwd);
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    const name = remote
        ? basename(remote.replace(/\.git$/, '').replace(/\/$/, ''))
        : basename(root || cwd);
    return { name, root: root || cwd, branch: branch || null };
}
//# sourceMappingURL=project.js.map