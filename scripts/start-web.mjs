import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const pause = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));

export async function checkMealService(url, fetchImpl = fetch) {
  let response;
  try { response = await fetchImpl(`${url}/api/health`, { signal: AbortSignal.timeout(1000) }); }
  catch { return null; }
  let health;
  try { health = await response.json(); } catch { /* A different service may own this port. */ }
  if (!response.ok || health?.status !== 'ok' || typeof health.aiConfigured !== 'boolean') {
    throw new Error('The meal-service port is being used by another app. Stop that app or set API_PORT to a free port.');
  }
  return health;
}

export async function startWeb(options = {}) {
  const env = options.env ?? process.env;
  const spawnChild = options.spawnImpl ?? spawn;
  const checkHealth = options.checkHealth ?? checkMealService;
  const wait = options.wait ?? pause;
  const log = options.log ?? console.log;
  const cwd = options.cwd ?? projectRoot;
  const port = Number(env.API_PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT must be a valid port number.');
  const apiUrl = `http://127.0.0.1:${port}`;
  const children = [];
  let stopping = false;
  let childFailure;
  let settleDone;
  let cleanup;
  const done = new Promise(resolveDone => { settleDone = resolveDone; });

  function stop(code = 0) {
    if (cleanup) return cleanup;
    stopping = true;
    cleanup = Promise.all(children.map(child => new Promise(resolveExit => {
      if (child.exitCode != null || child.signalCode != null) { resolveExit(); return; }
      let force;
      child.once('exit', () => { clearTimeout(force); resolveExit(); });
      force = setTimeout(() => child.kill('SIGKILL'), options.killGraceMs ?? 2000);
      child.kill('SIGTERM');
    }))).then(() => { settleDone(code); return code; });
    return cleanup;
  }

  function launch(args, childEnv, label) {
    const child = spawnChild(process.execPath, args, { cwd, env: childEnv, stdio: 'inherit' });
    children.push(child);
    child.on('error', () => {
      childFailure = new Error(`Could not start ${label}. Check your Node.js installation and run npm ci.`);
      // Failed spawns do not always emit exit, so exclude them from cleanup waits.
      children.splice(children.indexOf(child), 1);
      if (!stopping) { log(childFailure.message); void stop(1); }
    });
    child.on('exit', (code, signal) => {
      if (!stopping) {
        const result = label === 'Expo' && code === 0 ? 0 : 1;
        childFailure = new Error(`${label} stopped${signal ? ` (${signal})` : ''}. Check the messages above.`);
        if (result) log(childFailure.message);
        void stop(result);
      }
    });
    return child;
  }

  try {
    let health = await checkHealth(apiUrl);
    const reusedService = Boolean(health);
    if (health) log('Using the meal service already running on this computer.');
    else {
      log('Starting the meal service and web app together…');
      // Pin only this web process to loopback and a known port. Standalone
      // npm run server still respects .env.server settings for phone/LAN use.
      launch(['--env-file-if-exists=.env.server', 'server/index.mjs'], { ...env, API_HOST: '127.0.0.1', API_PORT: String(port) }, 'Meal service');
      const deadline = Date.now() + (options.readyTimeoutMs ?? 10000);
      while (!health && Date.now() < deadline) {
        if (childFailure) throw childFailure;
        await wait(100);
        if (childFailure) throw childFailure;
        health = await checkHealth(apiUrl);
      }
      if (childFailure) throw childFailure;
      if (!health) throw new Error('The meal service did not start. Check its messages above, then run npm run web again.');
    }
    log('Meal service is ready.');
    if (health.aiConfigured) log('AI key is configured. You can generate a grocery list in the browser.');
    else log(`AI needs your key in .env.server. Saved meals still work. After adding the key, restart ${reusedService ? 'the existing meal-service terminal' : 'this command'}.`);
    const clientEnv = { ...env, EXPO_PUBLIC_API_URL: env.EXPO_PUBLIC_API_URL || apiUrl };
    delete clientEnv.AI_API_KEY;
    delete clientEnv.OPENAI_API_KEY;
    log('Starting Expo and opening the web app…');
    launch([resolve(cwd, 'node_modules/expo/bin/cli'), 'start', '--web', ...(options.expoArgs ?? [])], clientEnv, 'Expo');
    return { apiUrl, done, stop };
  } catch (error) { await stop(1); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let running;
  try {
    running = await startWeb({ expoArgs: process.argv.slice(2) });
    const onSignal = () => { void running.stop(0); };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    process.exitCode = await running.done;
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
