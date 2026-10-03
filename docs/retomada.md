# Retomada do LC PLAY

Estado iniciado em 30/09/2026 e atualizado em 03/10/2026. Repositório: https://github.com/frostx25/LC-PLAY.git.

## Atualizacao de 03/10/2026

- Checkout atual: `C:\Users\leeoc\Desktop\PROJETOS\tv-player-platform`. As secoes anteriores abaixo sao historicas; limites de catalogo e pendencias da LG nelas foram superados pelos testes recentes.
- Backend e painel publicados, por solicitacao do proprietario, na VM `177.104.178.30`, SSH `9922`, em `/opt/lc-play`. Compose dedicado `lc-play-production`, banco independente do DashboardConecta e portas apenas em loopback.
- Painel: `https://lcplay.thxtech.site`. API: `https://api-lcplay.thxtech.site/api`. Conta do painel configurada conforme solicitado; senha privada fora do Git.
- Publicacao via Cloudflare Tunnel `lc-play-vm30`, com servico systemd `lcplay-cloudflared.service`. O HTTP/HTTPS do IP publico chega a outro proxy, por isso nao usar os antigos registros A para esses dois subdominios. `thxtech.site` e `www` continuam na Oracle, sem alteracoes.
- Banco local copiado uma unica vez ao PostgreSQL exclusivo de producao: uma C1 e duas fontes. Chaves de criptografia/identificacao mantidas; ativacao existente validada na TV, sem novo pareamento.
- Pacote de producao instalado na LG OLED C1 `192.168.15.5`, mesmo ID `com.lcplay.tv`, apontando a API HTTPS publica. O pacote local permanece separado. Gerar com `pnpm --filter @lc-play/lg-webos package:tv:production`.
- A TV baixa e processa M3U e EPG por JavaScript Service nativo. Teste real confirmou 305.954 itens: 2.777 canais, 21.484 filmes, 6.919 titulos de series e 281.693 episodios, sem chamadas ao catalogo do backend. Nova importacao levou aproximadamente 66 segundos.
- EPG XMLTV e exibicao de agora/a seguir validados. Video 1280 x 720 com audio, sem erro; tela cheia preserva o mesmo elemento de video e nao sobrepoe EPG.
- Conteudo adulto protegido nas tres secoes: PIN incorreto recusado, `0000` aceito e bloqueio reaplicado. Fixtures dos testes removidas ao recarregar; TV reaberta no app real ao terminar.
- Painel HTTPS validado em desktop e celular, incluindo login/logout, cookie Secure/HttpOnly, todas as paginas, cadastros preservados, endpoints protegidos e CORS webOS.
- Backups iniciais e configuracao privada protegidos na VM; credenciais temporarias de autorizacao e uploads removidos. Operacao, backups e novos deploys documentados em `deploy/README.md`.
- Codigo da implantacao e das validacoes incluido neste checkpoint do Git, por solicitacao do proprietario. Credenciais, bancos, relatorios privados e pacotes gerados continuam fora do repositorio. Novos deploys dependem de solicitacao.
- Proximos passos: implementar/testar o Roku e concluir a submissao do app LG. O backend publico deixou de ser pendencia; validar os demais itens da publicacao em `docs/publicacao-lg/pendencias.md`.

## Atualização de 01/10/2026

- A TV ao vivo passou a abrir como tela inicial no player LG, com menu lateral, categorias, lista de canais, prévia e programação no mesmo painel.
- Busca e favoritos de canais foram adicionados ao player. Os favoritos ficam no armazenamento local do aparelho.
- A prévia usa o stream real quando a fonte está configurada. O modo `?demo` mostra somente arte e programação ilustrativas.
- A tela foi conferida no navegador em 1280 x 720 e 1920 x 1080; build e lint do player LG passaram. Reprodução em TV LG real continua pendente.
- API, painel e player estão configurados nesta máquina, com PostgreSQL e Redis no Docker. Arquivos locais de ambiente e credenciais são ignorados pelo Git.
- O painel permite cadastrar uma fonte diretamente no formulário do dispositivo ou ao alterar sua fonte, com salvamento transacional.
- Player com catálogo por seção, lista ao vivo virtualizada, páginas de 24 cards e buffer HLS reduzido. A lista real desenhou 12 a 16 linhas para 2.000 canais; a resposta inicial ficou 66% menor. Detalhes e limites em `apps/lg-webos/README.md`.
- Falhas de reprodução agora aparecem na prévia e na tela cheia, com tentativa manual e reconexão automática limitada. Globo SP HD/FHD reproduziram; H265 ficou sem imagem no navegador e passou a mostrar orientação para usar HD/SD. Reprodução e travamentos em TV real continuam pendentes.

## Estado atual

- Monorepo com painel Next.js, API NestJS, contratos compartilhados, player LG React/Vite e base Roku SceneGraph/BrightScript.
- PostgreSQL e Redis locais pelo Docker; migração inicial versionada.
- Cadastro de clientes, dispositivos e fontes, vínculo de fonte, chave de ativação, suspensão e auditoria.
- Edição da fonte, M3U, EPG e credenciais no painel. Campos de substituição vazios preservam os segredos atuais.
- Player LG com menu horizontal, TV ao vivo, filmes, séries, categorias e busca.
- Grade EPG com programa atual, progresso e próximo programa.
- Séries agrupadas por título, temporada e episódio.
- Parser M3U em lotes e XMLTV; HLS carregado sob demanda para reprodução.

## Validação realizada

- Lint e typecheck da API, painel e player LG.
- Doze testes da API e dois testes de janela virtual passaram, cobrindo classificação M3U, episódios, EPG, criptografia, fonte direta e seleção de seção.
- Build dos contratos e do player LG.
- Fluxo real de ativação, catálogo e edição da fonte validado no navegador.
- Layout verificado em 1920 x 1080 e 1366 x 768.

## Pontos para continuar

- O catálogo entregue ao aparelho é limitado a 2.000 canais, 1.500 filmes e 5.000 episódios de até 750 séries. Os contadores refletem o total da fonte. Implementar consulta e paginação no servidor para disponibilizar o catálogo completo e todos os episódios.
- A classificação usa metadados, categoria e caminho da URL; revisar formatos adicionais de listas conforme surgirem.
- Testar instalação e reprodução na LG real. TV ao vivo, filme e episódio reproduziram no navegador desta máquina; isso não confirma codecs, memória ou fluidez em hardware. O alvo inicial de compilação é webOS 5 ou superior.
- Fontes Xtream podem ser cadastradas, mas a importação no player ainda aceita somente M3U.
- A grade atual mostra agora e a seguir; uma grade EPG por horários exige manter a programação completa.
- Implementar no Roku o catálogo, EPG e experiência equivalente ao player LG.
- Sincronizar favoritos entre aparelhos e implementar histórico, controle parental efetivo e proxy de reprodução continuam pendentes.

## Abrir nesta máquina

Este checkout está em `C:\Users\leeoc\OneDrive\Documentos\ChatGPT\LCPLAY`. Para avaliar somente a nova interface LG:

```powershell
cd C:\Users\leeoc\OneDrive\Documentos\ChatGPT\LCPLAY
pnpm --filter @lc-play/lg-webos dev
```

- Painel: http://localhost:3000
- API: http://localhost:4100/api
- Player: http://localhost:5173
- Demonstração: http://localhost:5173/?demo

Os serviços e o banco local já estão preparados nesta máquina. Em outra máquina, seguir a instalação do README e configurar novos arquivos locais de ambiente.

Publicação na VM depende de solicitação do proprietário.
