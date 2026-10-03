# Retomada do LC PLAY

Estado iniciado em 30/09/2026 e atualizado em 03/10/2026. Repositório: https://github.com/frostx25/LC-PLAY.git.

## Ponto de parada: preparacao final LG (03/10/2026)

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
