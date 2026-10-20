import { createRecipeServer } from './recipe-server.mjs';

const host = process.env.API_HOST || '127.0.0.1';
const port = Number(process.env.API_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT must be a valid port number.');
const server = createRecipeServer();
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the other server or change API_PORT.` : 'Could not start the meal service. Check API_HOST and API_PORT.');
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`Meal service listening on ${host}:${port}.`);
  console.log(process.env.AI_API_KEY || process.env.OPENAI_API_KEY ? 'AI meal lookup is configured.' : 'AI lookup needs AI_API_KEY in .env.server. Built-in meals still work.');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
