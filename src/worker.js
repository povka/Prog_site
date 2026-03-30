export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    return new Response(
      `Worker is running.\nPath: ${url.pathname}`,
      {
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      }
    );
  }
};