# LC PLAY na VM

## Ambiente publicado

- VM: `177.104.178.30`, SSH na porta `9922`, usuario `deo`.
- Projeto: `/opt/lc-play`; Compose: `lc-play-production`.
- Painel: `https://lcplay.thxtech.site`.
- API: `https://api-lcplay.thxtech.site/api`; health: `/api/health`.
- Login do painel: conta definida em `SEED_ADMIN_EMAIL`; senha somente no ambiente privado, nunca no repositorio ou pacote da TV.
- `thxtech.site` e `www` permanecem na Oracle. Os containers e o banco do DashboardConecta nao fazem parte deste Compose.

O IP publico encaminha HTTP/HTTPS a outro proxy, diferente do Nginx desta VM. Por isso a publicacao usa um Cloudflare Tunnel dedicado, sem alterar o proxy compartilhado ou exigir portas de entrada adicionais.

```text
Internet HTTPS -> Cloudflare -> lcplay-cloudflared.service
  -> Nginx 127.0.0.1:8087, selecionando o Host
     -> painel 127.0.0.1:3030
     -> API 127.0.0.1:4130
        -> PostgreSQL exclusivo, sem porta publicada
     -> suporte e fonte QA propria 127.0.0.1:4181
```

O servico JavaScript do aparelho LG baixa e processa listas e EPG diretamente do provedor; a API entrega a configuracao autorizada e nao retransmite videos de terceiros. A excecao e a fonte QA tecnica propria: seus documentos, M3U, EPG e pequenos clipes sinteticos sao publicados pelo tunel para avaliacao da LG.

## Configuracao privada

- `/opt/lc-play/deploy/.env.production`: arquivo `600`, pertencente a root.
- `/opt/lc-play` e `deploy`: diretorios `755`, root; backups `700`. Diretorios
  do projeto nao permitem escrita publica. A permissao privada do arquivo
  de ambiente depende tambem da protecao de seus diretorios pais.
- `/etc/lcplay-cloudflared/tunnel.json`: credencial exclusiva do tunel, arquivo `600`.
- `/etc/lcplay-cloudflared/config.yml`: configuracao gerada de `cloudflared.yml.example` com o UUID do tunel.
- `/etc/systemd/system/lcplay-cloudflared.service`: inicializacao e reinicio automaticos, usuario dinamico sem privilegios, credencial fornecida por `LoadCredential`.
- `/etc/nginx/sites-available/lcplay.thxtech.site`: `nginx.tunnel.conf`, limitado a loopback, login com rate limit e identificacao do IP encaminhado pelo conector local.

Os dois subdominios usam CNAME com proxy para o tunel, substituindo somente os antigos registros A de `lcplay` e `api-lcplay`. Nao apontar novamente esses nomes ao IP da VM enquanto este modo de publicacao estiver ativo.

O certificado de conta emitido por `cloudflared tunnel login` serve para criar o tunel e alterar as duas rotas DNS. Ele nao e necessario para executar o servico; nao guardar essa credencial de administracao junto ao codigo ou ao pacote da TV. Para futuras alteracoes administrativas, autenticar novamente ou usar o painel Cloudflare.

## Operacao

Na VM, como root:

```sh
cd /opt/lc-play/deploy
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs --tail 80 api admin
systemctl status lcplay-cloudflared.service --no-pager
journalctl -u lcplay-cloudflared.service -n 40 --no-pager
curl -fsS -H 'Host: api-lcplay.thxtech.site' http://127.0.0.1:8087/api/health
```

Atualizacoes posteriores, somente quando autorizadas:

```sh
docker compose --env-file .env.production -f compose.production.yml build
docker compose --env-file .env.production -f compose.production.yml run --rm -T api node /app/apps/api/node_modules/prisma/build/index.js migrate deploy --schema=/app/apps/api/prisma/schema.prisma
docker compose --env-file .env.production -f compose.production.yml up -d --wait
```

Manter `DATA_ENCRYPTION_KEY` e `DEVICE_ID_PEPPER` originais: trocar essas chaves impede a leitura das fontes e a identificacao dos dispositivos existentes. Nao restaurar o dump local a cada atualizacao e nao executar `down -v` no ambiente publicado.

## Migracao e backup

A migracao inicial restaurou o banco local em um PostgreSQL novo e exclusivo, preservando a ativacao da C1, seu vinculo e as duas fontes. `bootstrap-admin.mjs` validou a descriptografia das fontes e configurou a conta solicitada, sem executar um seed que sobrescrevesse os cadastros.

Backups iniciais privados em `/opt/lc-play/backups`: dump anterior a publicacao e configuracao original do Nginx. Um dump do banco nao substitui o backup seguro das chaves do arquivo de ambiente.

Exemplo de novo backup manual, com nome novo e permissoes privadas:

```sh
umask 077
docker compose --env-file .env.production -f compose.production.yml exec -T postgres pg_dump -U lc_play -d lc_play --format=custom --no-owner --no-acl > /opt/lc-play/backups/lc-play-AAAA-MM-DD.dump
```

Os bancos local e de producao sao independentes depois da copia inicial. Mudancas de cadastro feitas no painel publicado nao aparecem automaticamente no banco local.

## Pacote LG de producao

Nesta maquina:

```powershell
pnpm --filter @lc-play/lg-webos package:tv:production
```

O script usa `https://api-lcplay.thxtech.site`, gera `apps/lg-webos/dist-tv-production` e grava o IPK em `apps/lg-webos/artifacts/production`, preservando o build local. `LC_PLAY_API_URL` pode trocar a origem, mas deve ser HTTPS publico e nao incluir `/api`.

Instalar sobre o mesmo identificador `com.lcplay.tv`, sem desinstalar o app primeiro, preserva a ativacao no armazenamento do aparelho.

## Validacao

### Publicacao LG em 03/10/2026

Commit `6daa307` publicado sob autorizacao exclusiva do LC PLAY. Backup de banco,
fonte, ambiente e Nginx em `/opt/lc-play/backups/lg-release-6daa307-20261003T152639Z`;
imagem antiga da API em `lc-play-api:rollback-6daa307`. Nenhuma migracao nova,
seed ou restauracao de banco foi executada. C1 e outros containers preservados.

`lg-public` usa profile `lg-review`, contexto gerado por
`pnpm lg:store:public:package`, bind loopback, usuario sem privilegios e
filesystem readonly. O flag de aprovacao foi passado ao Compose, sem editar
o ambiente privado; o container preserva esse flag durante restart/reboot.
Uma futura **recriacao** exige passar novamente o flag, sob autorizacao:

```sh
LG_PUBLIC_RELEASE_APPROVED=1 docker compose --env-file .env.production -f compose.production.yml --profile lg-review build api lg-public
LG_PUBLIC_RELEASE_APPROVED=1 docker compose --env-file .env.production -f compose.production.yml --profile lg-review up -d --no-deps --wait api lg-public
```

Nao aplicar rotas novas do Nginx antes de o container estar saudavel. Fazer
backup da configuracao anterior, testar `nginx -t` e so depois recarregar.
Nunca publicar `artifacts/lg-submission` ou o kit interno inteiro.

- `node scripts/test-lg-public-production.mjs`: 18 verificacoes externas de
  documentos, fonte propria, EPG, MP4 Range, HLS e isolamento privado.
- `LG_REVIEW_PROVISION_APPROVED=1 node scripts/test-lg-review-production.mjs`:
  cria e remove apenas um dispositivo QA extra, reutiliza cliente QA, testa
  ativacao concorrente e estados, preserva C1 e as cinco chaves de revisao.
  Exige ambiente privado local e provisionamento concluido; nao rodar sem
  autorizacao para alterar dados QA de producao.
- `LG_NATIVE_SUPPORT=1 node scripts/test-lg-network-service.mjs`: tres leitores
  offline no pacote da C1, rolagem, Back por evento no elemento focado, foco
  restaurado e token mantido. Usuario confirmou depois setas/Back nos
  documentos e popup de saida na Home; outros fluxos/modelos seguem pendentes.
- `LG_NATIVE_REVIEW=1 node scripts/test-lg-network-service.mjs`: sessao
  temporaria no app existente da C1, substitui somente respostas de fonte
  por URLs HTTPS proprias, testa M3U/MP4/HLS/XMLTV/catalogos e restaura a
  fonte e catalogo originais. Nao altera cadastros nem consome chaves LG.
  Usuario confirmou imagem e som. Nao prova ativacao com chave de revisao
  em outra TV; capturas do inspetor nao mostraram a imagem do video.

URLs publicas: `/legal/`, `/legal/privacidade`, `/legal/termos`, `/playlist.m3u`,
`/epg.xml` em `https://lcplay.thxtech.site`. Fonte QA contem somente midia
sintetica propria. Chaves dos cinco aparelhos permanecem no arquivo local
privado ignorado pelo Git; nao constam das paginas, imagem Docker ou IPK.

Em 03/10/2026, o painel passou nos testes publicos em 1366 x 768 e 390 x 844. O pacote de producao instalado na C1 preservou a ativacao e carregou 2.777 canais, 21.484 filmes e 6.919 series (281.693 episodios), com EPG real, video 1280 x 720 com audio e tela cheia sem recriar o video. Os testes confirmaram zero chamadas ao catalogo do backend e PIN `0000` nas tres secoes. O tunel continuou respondendo apos reinicio do servico e remocao do certificado temporario de administracao.

- `scripts/test-production-panel.mjs`: HTTPS publico, login/logout, cookie Secure/HttpOnly, paginas administrativas em desktop/mobile, cadastros migrados, endpoints protegidos e CORS webOS. Le as credenciais de `deploy/.env.production` ignorado pelo Git, ou de variaveis privadas.
- `scripts/test-lg-network-service.mjs`: com `LG_TEST_API_URL=https://api-lcplay.thxtech.site` e `LG_NATIVE_CATALOG=1`, testa o app instalado na C1 contra a API publicada. `LG_NATIVE_CATALOG_FORCE=1` solicita nova importacao da lista.
- Relatorios e capturas ficam em `artifacts`, fora do Git. Credenciais nao devem ser incluidas nesses relatorios.

Fonte do procedimento do tunel: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/
