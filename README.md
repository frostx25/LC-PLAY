# LC PLAY

Plataforma para administrar e reproduzir fontes de mídia autorizadas em TVs LG webOS e Roku. O produto não inclui canais, filmes ou listas pré-carregadas.

## Aplicações

- `apps/admin-web`: painel administrativo Next.js.
- `apps/api`: API NestJS, Prisma e PostgreSQL.
- `apps/lg-webos`: player React/Vite para LG webOS, otimizado para controle remoto.
- `apps/roku`: aplicativo SceneGraph/BrightScript para Roku.
- `packages/contracts`: esquemas e contratos compartilhados.

## Rodar localmente

1. Copie os arquivos de exemplo de ambiente da raiz e de cada aplicativo e ajuste os segredos.
2. Execute `pnpm install`.
3. Execute `pnpm docker:up` para iniciar PostgreSQL e Redis.
4. Execute `pnpm db:generate && pnpm db:migrate && pnpm db:seed`.
5. Execute `pnpm dev:core`.

O desenvolvimento principal usa PostgreSQL no Docker, a mesma família de banco usada na implantação. Para trabalhar temporariamente sem Docker, altere `DATABASE_URL` em `apps/api/.env` para `file:./dev.db`, execute `pnpm db:generate:local && pnpm db:local:push && pnpm db:seed:local` e inicie a API com `pnpm --filter @lc-play/api dev:local`.

Painel: `http://localhost:3000`  
API: `http://localhost:4100`  
Preview LG: `http://localhost:5173`
Preview visual sem ativação: `http://localhost:5173/?demo`

O player organiza fontes M3U em TV ao vivo, filmes e séries. A TV ao vivo possui grade EPG com programa atual e próximo; séries são agrupadas por título, temporada e episódio. URLs e credenciais podem ser substituídas pelo painel sem exibir os valores já armazenados.

O administrador inicial usa o e-mail e a senha definidos em `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` no ambiente da API. As configurações locais, credenciais e bancos de desenvolvimento não são enviados ao repositório.

A migração inicial do PostgreSQL está versionada em `apps/api/prisma/migrations`.

O estado atual e os próximos passos estão em [docs/retomada.md](docs/retomada.md).

## Princípios

- O administrador é o único responsável por cadastrar fontes e vinculá-las a dispositivos.
- A ativação usa chave temporária e identidade oficial da plataforma, nunca um MAC inventado.
- Identificadores de dispositivo são armazenados como HMAC; credenciais de fontes são criptografadas.
- A arquitetura nasce preparada para múltiplos clientes, auditoria e revogação.

