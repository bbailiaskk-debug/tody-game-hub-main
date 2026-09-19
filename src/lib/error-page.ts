export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="bg">
  <head>
    <meta charset="utf-8" />
    <title>Todor Khristov Gaming</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#1DB954" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html { background-color: oklch(0.18 0.008 150); }
      body {
        font: 15px/1.5 system-ui, -apple-system, sans-serif;
        color: oklch(0.97 0.005 150);
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 1.5rem;
        background-color: color-mix(in oklab, oklch(0.18 0.008 150) 94%, oklch(0.78 0.19 155) 6%);
        background-image: linear-gradient(color-mix(in oklab, oklch(0.78 0.19 155) 9%, transparent), color-mix(in oklab, oklch(0.78 0.19 155) 9%, transparent));
        background-position: center;
        background-size: cover;
        background-attachment: fixed;
      }
      .card {
        max-width: 28rem;
        width: 100%;
        text-align: center;
        padding: 2.5rem 2rem;
        border-radius: 0.9rem;
        background-color: oklch(0.215 0.008 150);
        border: 1px solid oklch(0.3 0.01 150);
        box-shadow: 0 0 0 1px rgba(0,0,0,0.15), 0 20px 50px rgba(0,0,0,0.45);
      }
      .logo {
        font-size: 0.65rem;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: oklch(0.78 0.19 155);
        font-weight: 700;
        margin-bottom: 1.25rem;
      }
      h1 { font-size: 1.3rem; margin: 0 0 0.5rem; font-weight: 600; }
      p { color: oklch(0.68 0.012 150); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button {
        padding: 0.55rem 1.1rem;
        border-radius: 0.375rem;
        font: inherit;
        font-weight: 500;
        cursor: pointer;
        text-decoration: none;
        border: 1px solid transparent;
        transition: opacity 0.15s ease;
      }
      a:hover, button:hover { opacity: 0.88; }
      .primary { background: oklch(0.78 0.19 155); color: oklch(0.19 0.03 155); }
      .secondary { background: transparent; color: oklch(0.97 0.005 150); border-color: oklch(0.45 0.02 150); }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="logo">TODOR KHRISTOV GAMING</div>
      <h1>Страницата не се зареди</h1>
      <p>Нещо се обърка от наша страна. Опитай да презаредиш или се върни на началната страница.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Опитай отново</button>
        <a class="secondary" href="/">Към началото</a>
      </div>
    </div>
  </body>
</html>`;
}
