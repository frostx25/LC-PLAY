# Retomada do LC PLAY

Estado iniciado em 30/09/2026 e atualizado em 03/10/2026. Repositório: https://github.com/frostx25/LC-PLAY.git.

## Publicacao autorizada no Git e VM; retomada do QA LG (03/10/2026)

- Commit de codigo `1c60cf3` enviado a `origin/main` sob autorizacao do
  proprietario. Progresso, velocidade/tempo de download, cache nativo de seis
  horas, testes e documentos enviados; nenhum segredo ou artefato privado.
- Codigo desse commit sincronizado e comparado ao arquivo Git na VM
  `/opt/lc-play`. IPK fisico ja testado, SHA-256 `599e46def91f51765e58d7cea99ccc86a1977067d4584358e46be30345a045d0`,
  preservado privadamente em `/opt/lc-play/releases/1c60cf3/`.
- Backup privado de banco, fonte e ambiente em
  `/opt/lc-play/backups/lg-release-1c60cf3-20261003T171700Z`.
  Verificacao final comparou cadastros estaveis de dispositivos/fontes,
  hash do ambiente e IDs de TODOS os containers antes/depois: iguais.
  Sem migracao, seed, restauracao, rebuild ou restart de containers;
  API/painel/fonte QA nao tiveram codigo de runtime alterado neste release.
- Depois da sincronizacao, 18 checks HTTPS publicos e painel em desktop
  1366x768/mobile 390x844 passaram novamente. Seis aparelhos, duas fontes
  e ativacao da C1 preservados. 38 testes LG, nove de publicacao e seis do
  servico passaram, assim como typecheck/lint e teste local de progresso.
- C1 ligada confirmada pelo proprietario no IP `192.168.15.4`. Repetidos
  leitores offline com rolagem, Back e foco; token preservado. O diagnostico
  precisou retornar por mais de uma tela a partir de canais/tela cheia;
  ajustado apenas o script de teste para retorno limitado a quatro passos.
- Mesmo IPK revalidado na C1 com fonte HTTPS sintetica propria: dois canais
  MP4/HLS, XMLTV, mesmo video em tela cheia, dois filmes e uma serie/dois
  episodios. App fechado/reaberto antes da sessao; fonte e catalogo originais
  restaurados ao terminar. Nao consumiu chaves nem alterou banco. Relatorios
  `native-support-report.json` e `native-review-report.json` em artifacts.
  Inspecao verifica estado de audio/video; nao e nova confirmacao visual
  ou auditiva do usuario, nem teste completo de controle fisico/standby.
- Proprietario confirmou primeira distribuicao SOMENTE Brasil e interface
  em portugues brasileiro. `docs/publicacao-lg/envio-seller-lounge.md`
  registra arquivos, acesso privado e sequencia para o formulario.
- Cinco chaves privadas expiram em 02/11/2026 UTC. Planilha oficial existente
  ainda e rascunho com comentarios antigos: revisar N/A, evidencias e
  resultados antes de qualquer upload. Ainda pendentes token seguro, ACG,
  licencas, Magic Remote, standby/sessao longa e ativacao fisica QA isolada.
- NENHUM envio ao Seller Lounge. Ferramentas atuais nao controlam a aba
  autenticada; acompanhar campos por screenshots. Roku so depois do envio LG.

## Instalacao autorizada na C1: dados de tempo do download (03/10/2026)

O proprietario autorizou instalar a estimativa. Ultimo pacote validado e
instalado `com.lcplay.tv` `0.1.0`, SHA-256:
`599e46def91f51765e58d7cea99ccc86a1977067d4584358e46be30345a045d0`.
API publica HTTPS mantida; sem deploy na VM, commit/push ou envio a LG.

- Preservada a versao sem estimativa como rollback em
  `artifacts/lg-network-validation/rollback/com.lcplay.tv_before-timing_0.1.0_all.ipk`.
- Primeiro teste detectou parada da consulta de progresso apos uma
  tentativa. Aumentada tolerancia de 2 para 8 segundos, com ate tres
  falhas consecutivas antes de desistir; sem consultas simultaneas e sem
  interromper importacao. Teste adicional cobre falha seguida de resposta
  com demora maior que 2 segundos. 38 testes LG passaram; lint e build
  de producao aprovados. Nova instalacao realizada com esse ajuste.
- `LG_NATIVE_PROGRESS=1 LG_PROGRESS_REQUIRE_TIMING=1` no diagnostico
  passou na C1: velocidade e tempo decorrido medidos no download real,
  indexacao, canais e catalogos completos de filmes/series pelo mesmo
  snapshot; segunda visita em cache e Home sem nova importacao.
- A fonte atual NAO informa tamanho total. TV mostrou, por exemplo,
  `54,3 KB/s` e `7 s decorridos`, sem inventar restante/percentual.
  Estimativa com tamanho conhecido passou no teste local com HTTP real,
  mas nao foi testada fisicamente com outra fonte na C1 nesta etapa.
- Fingerprints antes/depois confirmaram token, favoritos/configuracoes,
  identidade/status/validade e fonte iguais. TV deixada na Home original.
  Relatorio `native-download-timing-report.json` e captura
  `native-download-timing.png` em `artifacts/lg-network-validation`.
- Nenhum teste de seis horas, standby, outros modelos ou controle
  fisico feito nesta etapa. QA completo da versao final continua pendente.

## Implementacao anterior: estimativa de download (03/10/2026)

Depois da instalacao abaixo, o proprietario pediu tempo/quantidade restante.
Implementados localmente MB restantes, velocidade media medida, tempo
decorrido e estimativa aproximada, calculada com bytes de transporte e
tamanho informado pela fonte. Sem tamanho total, mostrar somente bytes,
velocidade e tempo decorrido, SEM inventar percentual ou tempo restante.
Durante os primeiros 2 segundos calibra a velocidade; sem novos dados por
8 segundos, interrompe a estimativa e informa "Aguardando dados".
Na implementacao inicial era somente LOCAL. Posteriormente instalada
sob autorizacao e validada conforme checkpoint acima; VM/Git inalterados.
37 testes LG, lint e build:tv passaram. Verificacao local no Edge headless
passou em 1920x1080 com tamanho conhecido/ETA e 1280x720 com transferencia
chunked sem previsao inventada, sem sobrepor a Home; tambem revalidou
cache, navegacao, mudanca de fonte e atualizacao manual. Capturas/relatorio
em `artifacts/lg-progress-validation`. IPK de producao atual corresponde
ao ultimo hash validado acima; nao usar os hashes dos checkpoints antigos.

## Instalacao autorizada na C1: progresso e cache (03/10/2026)

O proprietario pediu instalar. Pacote `com.lcplay.tv` versao `0.1.0`
regerado com a API HTTPS publica e instalado SOBRE o mesmo ID, sem
desinstalar, na C1 `192.168.15.4`. SHA-256 instalado:
`40911f3d8fde6e56b3f90b9822195de4f9d7a503ce381e60b174d120d7df9993`.
Sem alteracao na VM, novo commit/push ou envio a LG.

- IPK anterior preservado em
  `artifacts/lg-network-validation/rollback/com.lcplay.tv_before-progress_0.1.0_all.ipk`.
- `LG_NATIVE_STATE=1` antes e `LG_NATIVE_PROGRESS=1` depois, com
  `node scripts/test-lg-network-service.mjs`: fingerprints confirmaram
  token, favoritos/configuracoes locais, aparelho, validade e fonte iguais.
  Nenhum segredo bruto salvo no relatorio; PIN nao foi alterado.
- Download real da fonte, indexacao e carregamento de canais observados
  na TV. Filmes e series carregaram completos pelo MESMO snapshot; segunda
  visita reutilizou o cache em memoria e voltar a Home nao fez importacao.
  Uma unica importacao forcada de teste, com consultas `catalogProgress`.
- Relatorio e capturas ignorados em `artifacts/lg-network-validation`,
  arquivos `native-progress-report.json`, `native-progress-download.png`
  e `native-progress-restored.png`. TV deixada na Home original.
- Este teste nao inclui sessao real de seis horas, standby, todos os modelos
  ou controle remoto fisico. Repetir QA completo no pacote final da loja.
- Pedido seguinte: acrescentar estimativa de tempo/quantidade restante.
  Essa nova alteracao deve ser identificada como LOCAL ate nova instalacao;
  o hash acima corresponde ao progresso sem estimativa de tempo restante.

## Atualizacao local: progresso e cache do catalogo LG (03/10/2026)

Alteracoes SOMENTE locais. Nao houve deploy, commit/push, instalacao na C1
ou envio a LG nesta etapa. A TV instalada ainda usa o pacote/hash do
checkpoint abaixo; estes testes nao validam fisicamente a nova versao.

- Progresso real no player: consulta da fonte, bytes recebidos da M3U,
  indexacao do arquivo, quantidade de canais/filmes/series e episodios
  lidos. Percentual por etapa somente quando o total e conhecido; fontes
  sem Content-Length usam bytes e indicador indeterminado. Com gzip,
  o percentual usa bytes de transporte, nao o tamanho descompactado.
- Servico nativo expoe `catalogProgress` sem URLs, tokens ou credenciais.
  Consulta a cada 500ms durante importacao, sem consultas concorrentes;
  navegacao/cancelamento/finalizacao encerram a consulta e ignoram respostas
  atrasadas. Inclusao desse metodo deve entrar na revisao ACG pendente.
- Validade da M3U/indexes passou de 5 minutos para 6 horas. Trocar tela ou
  voltar a Home reaproveita o cache; nao renova a idade do arquivo.
  Atualizar manualmente ainda forca novo download. A cada 5 minutos, com
  o app visivel, verifica-se a fonte/revisao autorizada pela API; sem
  mudanca e com cache valido, nao baixa nem rele os arquivos. Mudanca de
  fonte/URL/EPG no painel invalida o cache na proxima verificacao.
- Os indices ficam em `os.tmpdir()/com.lcplay.tv.catalog`; podem sobreviver
  ao encerramento/reinicio do servico, mas NAO sao armazenamento permanente
  garantido pelo sistema. Desconectar apaga o cache. Videos continuam em
  streaming; nao existe download offline dos filmes/episodios.
- EPG inalterado: cache em memoria por 5 minutos quando disponivel,
  30 segundos quando indisponivel; consulta por canal, podendo reutilizar
  a programacao ja apresentada ate a troca de programa. Reiniciar o
  servico perde esse cache. Nao ha download automatico de EPG na Home.
- `pnpm --filter @lc-play/lg-webos test`: 36 testes passaram; typecheck,
  lint e build:tv aprovados. Testes incluem cache em disco apos 1 hora,
  vencimento em 6 horas, recarregamento manual, gzip/transferencia chunked,
  contagens completas, cancelamento e respostas atrasadas.
- `node scripts/verify-lg-catalog-progress.mjs`: teste local com servico
  nativo real do Node, HTTP local e ponte Luna simulada no Edge headless.
  Validou download, 250/500 filmes/episodios, cache ao voltar a Home,
  verificacao sem reimportacao, mudanca de revisao e atualizacao manual;
  layouts sem sobreposicao em 1920x1080 e 1280x720. Relatorio/capturas
  ignorados em `artifacts/lg-progress-validation`.
- `node scripts/verify-lg-support.mjs` e 9 testes de publicacao passaram:
  documentos offline/Back/foco e paginas legais continuam funcionando.
- Proximo teste: empacotar novamente e instalar na C1, COM autorizacao,
  conferir progresso em fonte grande, navegacao e cache em sessao longa.
  Nao usar o IPK anterior como prova desta alteracao nem enviar a LG antes
  de repetir a validacao fisica e as verificacoes finais pendentes.

## Retomada: deploy LG autorizado e concluido (03/10/2026)

O proprietario confirmou nova autorizacao para atualizar **somente o LC
PLAY**. O deploy do commit `6daa307` foi concluido; nao houve envio a LG
nem novo commit/push nesta retomada. Alteracoes de verificacao e documentos
permanecem locais. LG continua antes de Roku.

- Backup privado da configuracao, fonte e banco em
  `/opt/lc-play/backups/lg-release-6daa307-20261003T152639Z`; imagem anterior
  da API preservada como `lc-play-api:rollback-6daa307`.
- Recriados somente API e novo `lg-public`; painel, PostgreSQL e containers
  dos outros projetos mantiveram seus IDs. Nginx validado antes do reload.
  Comparacao privada confirmou preservacao da fonte, token/PIN, validade e
  ativacao da C1. Segredos de `.env.production` nao foram alterados.
  Removida escrita publica dos diretorios LC PLAY; raiz/deploy `755`,
  ambiente `600` e backups `700`, todos pertencentes a root.
- Suporte, privacidade e termos publicados em `https://lcplay.thxtech.site/legal/`.
  Fonte propria em `/playlist.m3u` e EPG em `/epg.xml`, com MP4/HLS tecnicos.
  `scripts/test-lg-public-production.mjs`: 18 verificacoes aprovadas,
  inclusive MP4 Range 206, caminhos privados 404 e API protegida 401.
- Cinco dispositivos LG QA e fonte tecnica propria provisionados. Chaves
  de uso unico, validade de 30 dias, arquivo PRIVADO ignorado:
  `artifacts/lg-submission/reviewer-access.private.json`. Nao compartilhar
  publicamente nem inserir no pacote. Confirmar a validade antes do envio.
- `scripts/test-lg-review-production.mjs`: teste extra isolado passou em
  producao, incluindo corrida de uso unico, suspensao, vencimento, renovacao,
  fonte ausente e revogacao. Aparelho temporario removido; C1 e cinco chaves
  destinadas a LG preservados. Renovar nao desfaz suspensao administrativa.
  Esse teste de API nao substitui a ativacao em uma TV de avaliacao.
- Painel revalidado em desktop/mobile, login/logout e cookie seguro; seis
  aparelhos e duas fontes apos provisionamento. API e publicacao saudaveis.
- IP atual da C1 informado pelo proprietario: `192.168.15.4`; perfil CLI
  `lg-c1` atualizado. `192.168.15.5` atualmente pertence ao computador.
  Novo IPK `0.1.0` instalado sobre o mesmo ID, sem desinstalar, SHA-256
  `952e0c57f12e4a989f01402404c5202ffd768132530b71254d4b57bd21a496e3`.
- `LG_NATIVE_SUPPORT=1 node scripts/test-lg-network-service.mjs` passou
  no pacote instalado: tres documentos offline, fonte 28px sem overflow,
  rolagem, Back por eventos de teclado no elemento focado, restauracao do
  foco e token intacto. Relatorio/capturas em `artifacts/lg-network-validation`.
  Em seguida o usuario confirmou rolagem com setas, Back para Ajustes e
  popup nativo de saida na Home com o controle fisico. Nao generalizar
  esse resultado para todas as telas, Magic Remote ou outros modelos.
- `LG_NATIVE_REVIEW=1` passou na C1 com substituicao temporaria da resposta
  de fonte somente na sessao de teste: importacao nativa da M3U propria,
  dois canais MP4/HLS, XMLTV, mesmo video em tela cheia, catalogo de dois
  filmes e uma serie/dois episodios, reproducao de um filme e um episodio.
  Usuario confirmou imagem colorida e tom de audio na TV. Capturas do
  inspetor registram a interface, mas nao mostraram a imagem do video.
  Fonte e catalogo originais restaurados e verificados ao terminar; nenhum
  cadastro da C1 foi alterado. Relatorio `native-review-report.json` em
  `artifacts/lg-network-validation`. Nao e prova de ativacao com chave
  de avaliacao em outra TV, pois a C1 manteve sua propria sessao.
- Proximos testes: ativacao fisica de avaliacao em dispositivo separado,
  Magic Remote, Home/standby, retomada e sessao prolongada; armazenamento
  seguro do token, ACG e avisos
  de licencas continuam pendentes. Finalizar documentos OFICIAIS somente
  com resultados reais, confirmar pais/modelos, depois enviar no Seller Lounge.
  Controle da aba do usuario continua indisponivel nas ferramentas desta sessao.

## Checkpoint anterior: preparacao final LG (03/10/2026)

O proprietario pediu salvar no Git e continuar amanha. **Finalizar e enviar
LG antes de iniciar Roku. Nao houve nova publicacao na VM nem envio a LG
nesta etapa.** A conexao SSH iniciada ficou apenas no pedido de senha e
foi encerrada, sem executar comandos remotos.

- Conta Seller Lounge ja existente; proprietario informou login no
  navegador interno. As ferramentas desta sessao nao permitiram controlar
  essa aba. Na retomada, conferir a disponibilidade do controle; caso
  continue indisponivel, orientar pelos campos/capturas fornecidos pelo
  proprietario, sem inventar que houve acesso ou submissao.
- Confirmado para LC PLAY: Leonardo Pereira, suportelcplay@gmail.com,
  pessoa fisica em Sao Paulo sem CNPJ; aplicativo e ativacao gratuitos
  nesta versao; fornecedor da VM informado como Ascent, Brasil.
- Leitor offline de suporte/privacidade/termos implementado na ativacao e
  em Ajustes > Suporte e documentos. Texto unico em
  `apps/lg-webos/src/lib/legal-content.json`; paginas e Markdown gerados
  por `pnpm lg:store:legal`. Nao confundir identificacao deste projeto
  com os dados dos antigos projetos Classificados/Thx Tech.
- Back na entrada agora chama webOS.platformBack, respeitando teclado
  aberto. Leitor fecha com Back, restaura foco e suporta setas/ponteiro.
  Testado no navegador; falta teste fisico do NOVO pacote na C1.
- Fluxo LG_REVIEW implementado LOCALMENTE na API: OWNER, LG QA nova,
  URL exata da fonte tecnica propria, chave ate 30 dias e uso unico
  atomico. Chaves comuns seguem maximo de 24 horas. Script de
  provisionamento ainda NAO executado e codigos QA ainda NAO emitidos.
- `lg-public` preparado no Compose com profile `lg-review`, Docker
  readonly, bind 127.0.0.1:4181 e aprovacao explicita. Contexto gerado
  em `artifacts/lg-public`; publicar somente essa allowlist de documentos
  e midia tecnica. Nao publicar o kit interno inteiro ou credenciais.
- Proprietario AUTORIZOU atualizar exclusivamente o LC PLAY na VM para
  paginas/fonte/aparelhos QA, mas em seguida pediu parar para salvar no
  Git. Deploy foi adiado; retomar esse escopo com confirmacao antes de
  executar. Preservar DashboardConecta, site principal e C1 real.
- Candidato local em `artifacts/lg-submission/candidate`, ID
  `com.lcplay.tv`, versao 0.1.0, API HTTPS de producao. SHA-256 IPK:
  `952e0c57f12e4a989f01402404c5202ffd768132530b71254d4b57bd21a496e3`.
  NAO instalado nesta etapa. IPKs/relatorios gerados e segredos continuam
  ignorados no Git; fontes e geradores sao versionados para reproducao.
- Validacoes passaram: 34 API + 31 LG + 3 admin + 9 publicacao + 6
  transporte = 83 testes; lint/typecheck; pacote de producao; Docker
  readonly com MP4 Range 206; leitor/paginas em 1920x1080, 1280x720 e
  390x844. Os previews sao de navegador com fonte propria e API mock,
  nao prova fisica ou aprovacao LG.

### Ordem para retomar

1. Confirmar retomada do deploy exclusivo LC PLAY. Fazer backup e verificar
   servicos existentes; atualizar API e subir lg-public, sem alterar
   dados/senha/ativacao existentes. Nenhuma migracao nova foi criada.
2. Aplicar as rotas publicas allowlist de deploy/nginx.tunnel.conf somente
   depois de lg-public estar saudavel. Verificar HTTPS das tres paginas,
   M3U, EPG, HLS/MP4 e caminhos privados 404; site/painel/API preservados.
3. Provisionar cinco dispositivos QA via
   `scripts/prepare-lg-review-access.mjs`, com token OWNER privado e
   aprovacao explicita para producao. Arquivo de chaves fora do Git:
   `artifacts/lg-submission/reviewer-access.private.json`.
4. Revalidar o novo candidato na C1 e o fluxo QA sem sobrescrever o cadastro
   real. Completar Magic Remote, Back/popup, Home, standby/retomada,
   fontes ausentes/suspensas/vencidas e reproducao prolongada. Rever token
   local, ACG, licencas, direitos/retencao/backups e textos legais.
5. Atualizar UX Scenario e checklist OFICIAIS com resultados reais; definir
   pais/modelos alvo, conferir arquivos e enviar pelo Seller Lounge com
   o proprietario. Nao marcar teste pendente como aprovado.
6. Somente depois do envio confirmado a LG, iniciar implementacao e testes
   na Roku.

### Reproduzir o material local

```powershell
pnpm lg:store:assets
pnpm lg:store:legal
pnpm lg:store:test
pnpm --filter @lc-play/lg-webos package:tv:production
pnpm lg:store:public:package
```

Com Vite do player ativo em http://127.0.0.1:5173, executar tambem
`pnpm lg:store:verify:support`, `pnpm lg:store:capture` e
`pnpm lg:store:submission:package`. Nao iniciar multiplos servidores na
mesma porta; conferir os que ja estao rodando. As secoes seguintes
preservam o historico e NAO substituem este ponto de parada.

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
- Proximos passos atualizados pelo proprietario: concluir a submissao LG primeiro e somente depois implementar/testar Roku. O backend publico deixou de ser pendencia; validar os demais itens da publicacao em `docs/publicacao-lg/pendencias.md`.

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
