export default {
  async fetch(request, env, ctx) {
    return new Response("Thicc Magician Girl is alive.", {
      headers: { "Content-Type": "text/plain" }
    });
  }
};