import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const content = JSON.parse(await readFile(resolve(root, 'apps/lg-webos/src/lib/legal-content.json'), 'utf8'));
const names = { support: 'index', privacy: 'privacidade', terms: 'termos' };
const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

// The TV reader and web documents are generated from the same reviewed text.
for (const [id, document] of Object.entries(content.documents)) {
  const sections = document.sections.map((section) => `<section><h2>${escape(section.title)}</h2>${section.paragraphs.map((p) => `<p>${escape(p)}</p>`).join('')}</section>`).join('\n');
  const nav = Object.entries(content.documents).map(([key, value]) => `<a href="${value.path}"${key === id ? ' aria-current="page"' : ''}>${key === 'support' ? 'Suporte' : key === 'privacy' ? 'Privacidade' : 'Termos'}</a>`).join('');
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="description" content="${escape(document.summary)}">
  <link rel="icon" href="/assets/store-icon-400.png">
  <link rel="stylesheet" href="/legal/styles.css">
  <title>${escape(document.title)} | LC PLAY</title>
</head>
<body>
  <header class="site-header"><div class="header-inner">
    <a class="brand" href="/legal/"><img width="48" height="48" src="/assets/store-icon-400.png" alt=""><strong>LC <span>PLAY</span></strong></a>
    <nav class="site-nav" aria-label="Navegação principal">${nav}</nav>
  </div></header>
  <main class="page">
    <span class="eyebrow">LC PLAY</span>
    <h1>${escape(document.title)}</h1>
    <p class="lead">${escape(document.summary)}</p>
    <div class="contact-line"><strong>Contato</strong><a href="mailto:${content.email}">${content.email}</a></div>
    <div class="content-layout">
      <article class="article">${sections}</article>
      <aside class="summary" aria-label="Responsável"><strong>${escape(content.operator)}</strong><p>Pessoa física, sem CNPJ constituído.</p><p>São Paulo, SP, Brasil.</p><p>Aplicativo e ativação gratuitos nesta versão.</p></aside>
    </div>
  </main>
  <footer class="site-footer"><div class="site-footer-inner"><p>LC PLAY · Seu conteúdo. Sua tela.</p><p>Revisão: ${content.revision.split('-').reverse().join('/')}</p></div></footer>
</body>
</html>
`;
  await writeFile(resolve(root, `docs/publicacao-lg/public-site/${names[id]}.html`), html, 'utf8');
  if (id !== 'support') {
    const markdown = `# ${document.title}\n\nProposta para publicação. Revisão ${content.revision}. Texto compartilhado com a TV e as páginas web em \`apps/lg-webos/src/lib/legal-content.json\`.\n\n${document.sections.map((section) => `## ${section.title}\n\n${section.paragraphs.join('\n\n')}`).join('\n\n')}\n`;
    await writeFile(resolve(root, `docs/publicacao-lg/${names[id]}.md`), markdown, 'utf8');
  }
}
console.log('LG support, privacy and terms generated from shared content. Not published.');
