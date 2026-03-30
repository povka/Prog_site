export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/discord/interactions") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      if (body.type === 1) {
        return Response.json({ type: 1 });
      }

      return Response.json({
        type: 4,
        data: {
          content: "Thicc Magician Girl received something, but no command handler exists yet."
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};