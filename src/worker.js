export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/discord/interactions") {
      return new Response("Discord endpoint is ready.", {
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    return env.ASSETS.fetch(request);
  }
};