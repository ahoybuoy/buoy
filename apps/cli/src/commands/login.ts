/**
 * buoy login - Authenticate with Buoy Cloud
 *
 * Opens browser to authenticate and saves API token locally.
 */

import { Command } from 'commander';
import { createInterface } from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createServer } from 'http';
import { hostname } from 'os';
import {
  updateCloudConfig,
  isLoggedIn,
  getApiEndpoint,
  readCloudConfig,
} from '../cloud/config.js';
import { getMe, getGitHubInstallUrl, listGitHubInstallations } from '../cloud/client.js';
import { spinner, error, info, warning, keyValue, newline } from '../output/reporters.js';

const execAsync = promisify(exec);

/**
 * Open URL in default browser
 */
async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  let command: string;

  switch (platform) {
    case 'darwin':
      command = `open "${url}"`;
      break;
    case 'win32':
      command = `start "" "${url}"`;
      break;
    default:
      command = `xdg-open "${url}"`;
  }

  await execAsync(command);
}

/**
 * Validate API token by fetching user info
 */
async function validateToken(token: string): Promise<{
  valid: boolean;
  user?: {
    email: string;
    name: string | null;
    id: string;
  };
  account?: {
    id: string;
    name: string;
    plan: string;
  };
}> {
  // Temporarily store token to make the request
  const originalConfig = readCloudConfig();
  updateCloudConfig({ apiToken: token });

  const result = await getMe();

  if (!result.ok || !result.data) {
    // Restore original config
    updateCloudConfig(originalConfig);
    return { valid: false };
  }

  return {
    valid: true,
    user: result.data.user,
    account: result.data.account,
  };
}

/**
 * Listen on a random loopback port for the dashboard to POST the token.
 * Resolves with the token, or null if the server could not start.
 */
function waitForTokenOnLoopback(): { url: string | null; token: Promise<string>; close: () => void } {
  let resolveToken: (t: string) => void = () => {};
  const token = new Promise<string>((resolve) => { resolveToken = resolve; });

  const server = createServer((req, res) => {
    // Only the dashboard origin should be talking to us; answer preflight so
    // the browser allows the cross-origin POST from app.buoy.design.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method !== 'POST' || req.url !== '/token') { res.writeHead(404); res.end(); return; }

    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body) as { token?: string };
        if (parsed.token && parsed.token.startsWith('buoy_')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
          resolveToken(parsed.token);
          return;
        }
      } catch { /* fall through */ }
      res.writeHead(400); res.end();
    });
  });

  let url: string | null = null;
  try {
    server.listen(0, '127.0.0.1');
    const addr = server.address();
    if (addr && typeof addr === 'object') url = `http://127.0.0.1:${addr.port}/token`;
  } catch {
    url = null;
  }

  return { url, token, close: () => { try { server.close(); } catch { /* ignore */ } } };
}

/**
 * Race a terminal prompt against the loopback listener. Whichever supplies a
 * token first wins; the readline prompt is closed either way.
 */
function promptOrLoopback(question: string, loopbackToken: Promise<string>): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: string) => {
      if (done) return;
      done = true;
      rl.close();
      resolve(value.trim());
    };
    rl.question(question, finish);
    loopbackToken.then((t) => {
      if (!done) {
        process.stdout.write('\n');
        finish(t);
      }
    });
  });
}

export function createLoginCommand(): Command {
  const cmd = new Command('login');

  cmd
    .description('Authenticate with Buoy Cloud')
    .option('-t, --token <token>', 'API token (skip browser flow)')
    .option('--no-browser', 'Do not open browser automatically')
    .option('--signup', 'Create a new account instead of logging in')
    .action(async (options) => {
      // Check if already logged in
      if (isLoggedIn()) {
        const config = readCloudConfig();
        warning('Already logged in');
        if (config.email) {
          keyValue('Account', config.accountName || config.email);
        }
        info('Run `buoy logout` to sign out first');
        return;
      }

      let token: string;

      if (options.token) {
        // Token provided directly
        token = options.token;
      } else {
        // Interactive login/signup flow. The dashboard's /cli-auth page mints
        // an API key and POSTs it back to a loopback listener, so pasting is
        // only the fallback.
        const endpoint = getApiEndpoint();
        const appOrigin = endpoint.replace('api.', 'app.');
        const listener = waitForTokenOnLoopback();
        const params = new URLSearchParams({ host: hostname() });
        if (listener.url) params.set('callback', listener.url);
        const cliAuthPath = `/cli-auth?${params.toString()}`;
        const authUrl = options.signup
          ? `${appOrigin}/sign-up?redirect_url=${encodeURIComponent(cliAuthPath)}`
          : `${appOrigin}${cliAuthPath}`;

        newline();
        info(options.signup
          ? 'Opening browser to create your Buoy account...'
          : 'Opening browser to connect the CLI to Buoy Cloud...');
        newline();

        if (options.browser !== false) {
          try {
            await openBrowser(authUrl);
            info('Browser opened. Approve the key there and this terminal will continue.');
          } catch {
            warning('Could not open browser automatically.');
          }
        }

        newline();
        info(`If the browser didn't open, visit: ${authUrl}`);
        newline();

        try {
          token = await promptOrLoopback('Waiting for the browser (or paste the key here): ', listener.token);
        } finally {
          listener.close();
        }

        if (!token) {
          error('No token provided. Login cancelled.');
          process.exit(1);
        }
      }

      // Validate token
      const spin = spinner('Validating token...');

      const validation = await validateToken(token);

      if (!validation.valid) {
        spin.fail('Invalid token');
        error('The provided token is invalid or expired.');
        process.exit(1);
      }

      // Save config
      updateCloudConfig({
        apiToken: token,
        userId: validation.user?.id,
        email: validation.user?.email,
        accountId: validation.account?.id,
        accountName: validation.account?.name,
      });

      spin.succeed('Logged in successfully');
      newline();

      keyValue('Account', validation.account?.name || 'Unknown');
      keyValue('Email', validation.user?.email || 'Unknown');
      keyValue('Plan', validation.account?.plan || 'free');

      // Collapse the two-step funnel: most people who log in from a drift
      // hint want PR reviews, so offer the GitHub App install right here.
      let hasInstall = false;
      try {
        const installs = await listGitHubInstallations();
        hasInstall = !!installs.ok && (installs.data?.installations || []).length > 0;
      } catch { /* treat as no install */ }

      if (!hasInstall && options.browser !== false && process.stdin.isTTY) {
        newline();
        const answer = await promptOrLoopback(
          'Set up the GitHub PR bot now so every pull request gets reviewed? [Y/n] ',
          new Promise<string>(() => {}),
        );
        if (answer === '' || /^y/i.test(answer)) {
          const installUrl = getGitHubInstallUrl(getApiEndpoint());
          try {
            await openBrowser(installUrl);
            info('Browser opened. Choose the repositories Buoy should review.');
          } catch {
            info(`Open this URL to install the GitHub App: ${installUrl}`);
          }
          newline();
          info('After installing, run `buoy ahoy status` to verify.');
          return;
        }
      }

      newline();
      info('You can now use:');
      info('  buoy ahoy github  - Set up the GitHub PR bot');
      info('  buoy ahoy status  - Show current account');
      info('  buoy ahoy logout  - Sign out');
    });

  return cmd;
}
