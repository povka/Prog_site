export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/discord/interactions") {
      return new Response("Discord endpoint is ready.", {
        headers: { "Content-Type": "text/plain" }
      });
    }

    return env.ASSETS.fetch(request);
  }
};