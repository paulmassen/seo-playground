/** Node launches are local-only unless the operator explicitly opts into network access. */
export function serverOptions(env = process.env) {
  return {
    port: env.PORT?.trim() || '3000',
    hostname: env.SEO_PLAYGROUND_BIND?.trim() || '127.0.0.1',
  };
}
