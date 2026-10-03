# Teste local na LG

## Ambiente verificado em 01/10/2026

- Checkout nesta máquina: `C:\Users\leeoc\Desktop\PROJETOS\tv-player-platform`.
- TV: LG OLED55C1PSA, webOS SDK 6.5.3, firmware 03.53.45.
- IP atual da TV: `192.168.15.5`. IP atual do computador: `192.168.15.8`.
- Painel: http://localhost:3000. Player de desenvolvimento: http://localhost:5173.
- API para a TV: http://192.168.15.8:4100/api.
- Dispositivo local cadastrado: `LG OLED C1 - teste na TV`, com a fonte local já existente. O dispositivo anterior de preview foi preservado.
- Pacote instalado e aberto; tela de ativação, imagem local, catálogo, logos e EPG foram conferidos por depuração e captura da TV.
- Um canal informou reprodução em andamento, resolução 1920x1080 e ausência de erro. Imagem e áudio físicos, codecs variados e reprodução prolongada ainda exigem validação do usuário.

## Preparar o computador

TV e computador devem estar na mesma rede. Os IPs podem mudar; confirme antes de gerar outro pacote.

1. Abra Docker Desktop e execute `pnpm docker:up` na raiz.
2. Execute `pnpm install --frozen-lockfile`, `pnpm db:generate` e `pnpm db:migrate`.
3. Em `apps/lg-webos/.env.local`, configure `VITE_API_URL=http://IP-DO-PC:4100`.
4. Em `apps/api/.env`, configure `PLAYER_WEB_ORIGINS=file://com.lcplay.tv-webos,http://IP-DO-PC:5173`. Caso outro modelo envie uma origem diferente, confira no depurador antes de adicioná-la; não use wildcard.
5. Execute `pnpm dev:core`. Não rode o seed novamente para um banco local já configurado.

A origem observada na C1 foi `file://com.lcplay.tv-webos`. O token do dispositivo continua obrigatório para configuração, catálogo e heartbeat; CORS não substitui autenticação.

Se a TV não alcançar a API, verifique o firewall do Windows para TCP 4100, restrito à TV ou à rede local. Não publique banco, Redis ou portas de desenvolvimento na Internet.

## Parear a TV

Instale o aplicativo Developer Mode da LG, entre com sua conta de desenvolvedor e habilite Dev Mode Status. Depois de reiniciar, habilite Key Server.

```powershell
pnpm exec ares-setup-device --add lg-c1 --info host=192.168.15.5 --info port=9922 --info username=prisoner
pnpm exec ares-novacom --device lg-c1 --getkey
pnpm exec ares-device --system-info --device lg-c1
```

Informe a passphrase exibida pela TV somente no prompt de pareamento. A chave SSH fica no perfil do usuário, fora do projeto; não a publique. Se o dispositivo já estiver cadastrado, use `ares-setup-device --modify lg-c1 --info host=NOVO-IP`.

Referência oficial: https://webostv.developer.lge.com/develop/getting-started/developer-mode-app.

## Gerar e instalar

```powershell
pnpm --filter @lc-play/lg-webos package:tv
pnpm exec ares-install --device lg-c1 apps/lg-webos/artifacts/com.lcplay.tv_0.1.0_all.ipk
pnpm exec ares-launch --device lg-c1 com.lcplay.tv
```

Para atualizar um aplicativo que está aberto, feche-o antes: `pnpm exec ares-launch --device lg-c1 --close com.lcplay.tv`. Não desinstale sem necessidade, para preservar o estado local da TV.

O build normal em `dist` é para web. O pacote da TV usa `dist-tv` e inclui HLS.js no mesmo bundle para evitar módulos de arquivo local. O valor de `VITE_API_URL` é incorporado durante a compilação: após mudar o IP do computador, gere e instale outro pacote.

No painel, vincule a fonte a um dispositivo LG e gere sua chave de ativação. Essa chave é diferente da passphrase do Developer Mode. A ativação usa o LGUDID do aparelho, não um MAC inventado.

## Depurar

```powershell
pnpm exec ares-inspect --device lg-c1 com.lcplay.tv
```

O comando mostra uma URL local do depurador e precisa continuar aberto durante a inspeção. Encerrá-lo não fecha o LC PLAY. Observe erros de JavaScript, rede, estado do vídeo e uso prolongado. Vídeo nativo pode usar uma camada de hardware que não aparece na captura do navegador; confirme imagem e áudio na TV.

O Developer Mode tem prazo de sessão. Renove pelo botão EXTEND antes de expirar; segundo a LG, a desativação do modo remove os aplicativos de desenvolvimento.

Este teste é local. Nenhuma publicação na VM ou no Git faz parte desse procedimento.

## Interface e navegação (01/10/2026)

- O aplicativo inicia no menu com cinco opções e textos maiores.
- TV ao vivo: categorias à esquerda, canais numerados no centro e prévia com EPG à direita.
- Primeiro clique no canal: prévia com áudio habilitado. Segundo clique no mesmo canal: o mesmo vídeo é ampliado por CSS, sem recriar o player ou reiniciar a conexão.
- Tela cheia não exibe X, selo ao vivo ou EPG sobre o vídeo; use Voltar no controle.
- Voltar fecha a tela cheia e restaura o foco no canal selecionado. O EPG permanece na tela de navegação.
- Filmes e séries: categorias com contadores à esquerda e quatro pôsteres por linha em Full HD, com rolagem e paginação.
- Configurações: ações à esquerda e informações da conta ou do dispositivo à direita.

A ordenação padrão das três telas segue as categorias das fotos de referência. TV começa por Jogos de hoje, Eventos, Reality e regiões da Globo. Filmes começam por Lançamentos (anos decrescentes), 4K, Netflix, Disney/Marvel, HBO/DC, Look/Prime Video, Prime Video, Globoplay e Apple TV. Séries começam por Netflix, Disney/Marvel, HBO/DC, Prime Video, Globoplay, Paramount, Apple TV, Diversas e Novelas.

Em Todos, os conteúdos são agrupados nessa mesma sequência. Dentro de cada categoria, a ordem da fonte é preservada; séries não são mais reordenadas alfabeticamente. Categorias extras mantêm a ordem de primeira aparição na fonte e categorias adultas ficam no final. Apenas categorias com conteúdo carregado são exibidas.

A ordem padrão da lista é fixa. O seletor de ordenação dos canais foi removido; navegar com as setas não altera a sequência.

## Carregamento do catálogo

O download inicial da lista M3U tem limite de 90 segundos. O EPG mantém seu limite separado de 20 segundos. Uma fonte indisponível ainda pode atingir esses limites.

Requisições simultâneas da mesma fonte compartilham uma importação. Após cinco minutos, a API entrega o último catálogo disponível enquanto atualiza a fonte em segundo plano; falhas na atualização não descartam esse catálogo.

A TV mantém TV ao vivo, Filmes e Séries em memória por cinco minutos, evitando nova requisição ao revisitar uma seção nesse período. Recarregar força a atualização local; trocar de fonte, ativar ou desconectar limpa esse cache.

Verificado na LG C1 durante o teste com limite de 120 segundos: a primeira tentativa atingiu esse limite, mas a nova tentativa carregou a lista e o EPG em aproximadamente 20 segundos. Depois disso, a primeira consulta de Filmes levou 79 ms e a de Séries 65 ms. Voltar de TV ao vivo para Filmes e reabrir Séries não gerou novas requisições nem exibiu carregamento. O limite foi posteriormente reduzido para 90 segundos a pedido do usuário, mantendo os caches. Os caches são em memória: reiniciar a API ou o aplicativo exige uma primeira carga novamente.

Verificado no navegador local em 1920x1080, 1280x720 e 390x844, além da LG OLED C1 em 1920x1080. Na TV, os pôsteres carregaram e o vídeo ao vivo reportou readyState 4, resolução 1920x1080 e nenhum erro durante o teste. Confirme imagem e áudio fisicamente no aparelho.

Na transição de prévia para tela cheia, a LG preservou o mesmo elemento de vídeo e a mesma URL, com zero eventos de loadstart, emptied ou pause. O tempo da transmissão continuou avançando. O comando Voltar (461) restaurou a prévia e o foco no canal, sem interromper o vídeo; três ciclos adicionais de ampliar/voltar também mantiveram a reprodução.

## Pacote final local e resiliência (02/10/2026)

- Pacote: `com.lcplay.tv_0.1.0_all.ipk`.
- SHA-256: `6C8823C6984907E7301E7549BA74E99F41B62D021B2EC1D2B791A58864485E1F`.
- Com a API local desligada, a configuração encerrou em 15 segundos, abriu a Home com mensagem de nova tentativa e preservou o token do dispositivo. Não voltou à ativação.
- Após a API retornar, o botão `Atualizar` recuperou 306 mil itens, 2.777 canais e o EPG no mesmo processo, sem reinstalação ou reativação.
- Setas alteraram o foco visível. As seleções abriram TV ao vivo, Filmes e Séries; Back fechou reprodução, voltou ao catálogo e retornou à Home.
- O EPG exibiu programa atual, próximo programa, horários e descrição. O vídeo ao vivo informou `readyState 4`, reprodução ativa e resolução 1920 × 1080.
- Na ampliação, o mesmo vídeo avançou de 21,2 s para 39,5 s e voltou à prévia sem pausar ou trocar a mídia. A camada de vídeo por hardware fica preta na captura do DevTools; imagem e som foram confirmados fisicamente em testes anteriores.
- Um filme informou `readyState 4`, reprodução ativa e resolução 1920 × 1012. Um episódio informou `readyState 4`, reprodução ativa e resolução 1280 × 640.
- O teste usou a fonte local já vinculada e não alterou suas credenciais. A submissão ainda exige repetir os casos com a fonte QA isolada e o backend público HTTPS.

## Pesquisa acionada por OK ou clique (02/10/2026)

Os campos de pesquisa de TV ao vivo, Filmes e Séries recebem foco como botões. O input só é montado e recebe foco após OK ou clique. Ao concluir com Enter ou retornar com Back (461), o campo volta ao modo de navegação, preservando o texto pesquisado. Backspace continua apagando texto durante a edição.

Teste repetível no navegador: com o player de desenvolvimento aberto, executar `node scripts/test-lg-search.mjs`. As três telas passaram por navegação com setas, entrada via OK/clique, filtro, edição e retorno. Na C1, a inspeção do pacote instalado também confirmou foco no botão sem input, ativação por OK e retorno por Back nas três telas. O teste de foco na TV foi executado com o catálogo vazio enquanto a fonte externa excedia o limite de download.

SHA-256 do pacote com esta correção: `91242320E98611729A4D2980C5866880ACA0A5348F753F5E1289FE450C36CAAF`.

## Catalogo completo e rolagem continua (02/10/2026)

- Removidos os cortes de 2.000 canais, 1.500 filmes, 750 series e oito episodios por serie. O limite de tamanho do arquivo M3U e o timeout de download de 90 segundos continuam protegendo a API.
- A API preserva os itens validos e unicos de toda a lista. A LG recebe todas as capas de series e carrega os episodios da serie selecionada em uma rota autenticada, sem enviar todos os episodios para a TV de uma vez.
- Filmes e series usam cinco colunas na TV, capas grandes ocupando a largura da coluna e rolagem continua virtualizada. A busca considera toda a secao, nao apenas as capas montadas. Voltar de uma serie preserva a posicao e o foco.
- A contagem de series na Home usa titulos distintos, sem confundir quantidade de series com quantidade de episodios.
- Validacao: 29 testes da API e 15 testes do player; `node scripts/test-lg-search.mjs`; `node scripts/test-lg-catalog.mjs`, com o player de desenvolvimento e o preview QA em 4180 abertos. O teste de catalogo usa fixtures isoladas de 10.000 filmes e 9.000 series, em 1920x1080, 1280x720 e 390x844, incluindo ultimo item, busca global, erro/nova tentativa de episodios, temporada completa e restauracao do foco.
- Na C1, a fonte real voltou a responder: a categoria Lancamentos 2026 exibiu 384 filmes, a secao Todos informou aproximadamente 21 mil filmes e 30 capas tinham imagens carregadas. Os dados ficticios dos testes nao foram vinculados ao dispositivo nem salvos no painel.
- Pacote local atualizado e instalado na C1. SHA-256: `917E8081A06975667C0B558A7DC09BF92B197C65CEBA4976A975AE789DC58C6C`.
- Nenhuma publicacao na VM ou envio para o Git foi feito nesta alteracao.

## JavaScript Service: acesso direto as fontes (03/10/2026)

- Teste isolado com `com.lcplay.networktest` e `com.lcplay.networktest.service`.
  O LC PLAY principal e a fonte vinculada foram preservados.
- Runtime confirmado na C1: Node.js `v8.12.0`. As requisicoes usam os modulos
  `http`/`https` do servico, nao o `fetch` do navegador nem o backend da VM.
- As duas fontes cadastradas responderam HTTP 200. Cada M3U foi baixada inteira:
  91.596.060 bytes, com cabecalho `#EXTM3U`, em aproximadamente 13 a 14 segundos.
- EPG da fonte principal: HTTP 200, 19.384.081 bytes, raiz XMLTV reconhecida;
  transferencia completa em aproximadamente um segundo.
- O EPG alternativo respondeu com uma amostra XMLTV na primeira tentativa, mas
  as transferencias completas e a repeticao isolada retornaram HTTP 200 vazio
  depois de aproximadamente 30 segundos. Nao considerar esse EPG aprovado.
- Nenhuma requisicao HTTP ao fornecedor foi registrada no navegador durante
  os testes do servico. Relatorios sem credenciais em
  `artifacts/lg-network-validation/report.json` e `epg-retry-report.json`.
- Cinco testes locais passaram: sintaxe Node 8, M3U, gzip, redirecionamentos,
  EPG, erros, resposta vazia e limites de tamanho/tempo.
- Este resultado valida acesso e transferencia, nao o processamento completo
  do catalogo ou a integracao com a interface. O player continua usando a API
  atual para catalogo/EPG. Prototipo e procedimento em
  `apps/lg-webos/network-probe/README.md`.
- Nenhuma publicacao na VM, alteracao no DashboardConecta ou envio ao Git.

## EPG nativo e controle parental (03/10/2026)

- O pacote principal inclui o servico `com.lcplay.tv.guide`. Quando o canal
  nao possui programa atual/proximo validos no XMLTV, a TV consulta o guia
  da API do fornecedor pelo servico Node, sem CORS do navegador ou download
  de XMLTV pela VM. O XMLTV valido continua sendo preferido.
- A rota autenticada `v1/device/epg/source` entrega somente a configuracao da
  fonte vinculada ao dispositivo ativo. Nao faz download no servidor e usa
  `Cache-Control: no-store`; nenhuma URL com credenciais vai para relatorios.
- O ID de reproducao da M3U pode diferir do ID da API. O servico resolve os
  canais por nome/identificador EPG em `get_live_streams`, antes de consultar
  `get_short_epg`; aplica cache, coalescencia, limites e cancela resultados
  atrasados quando o usuario troca de canal.
- A fonte extra retornou XMLTV vazio, mas seu guia por canal respondeu.
  Na C1, o fallback exibiu programas reais de Globo SP FHD e preservou o
  mesmo elemento de video ao ampliar. Teste com substituicao temporaria
  apenas da configuracao EPG e simulacao de XMLTV indisponivel no frontend;
  a fonte cadastrada no banco nao foi alterada. Esse caso valida o guia
  e a identidade do video, nao a qualidade de imagem/audio da transmissao.
- Removido `Array.at` da leitura de ID: esse recurso nao existe no navegador
  da C1. Teste de regressao cobre esse ambiente sem `Array.at`.
- Categorias adultas de TV ao vivo, filmes e series iniciam bloqueadas.
  PIN inicial: `0000`. Canais/capas adultos nao aparecem em Todos, pesquisa
  ou favoritos antes da autorizacao. Categorias exibem cadeado e abrem um
  teclado numerico operavel pelo controle remoto.
- Ajustes > Controle parental permite alterar o PIN (exigindo o atual) e
  bloquear novamente. O PIN fica no armazenamento local do aparelho; a
  liberacao fica apenas na sessao e reiniciar o app volta a bloquear. Cinco
  tentativas erradas impõem espera de 30 segundos. Falha ao salvar o PIN
  e informada, sem apresentar uma alteracao como concluida.
- Classificacao adulta depende das categorias identificadas da fonte
  (Adultos, XXX, +18 e equivalentes); nao ha analise automatica das imagens.
  Esse bloqueio parental e do player LG, nao substitui autenticacao da API
  nem implementa controle parental no aplicativo Roku.
- Testes: 30 da API, 24 do player e cinco do transporte Node; typecheck/lint
  sem erros. `scripts/test-lg-parental.mjs` e `scripts/test-lg-epg.mjs`
  passaram em 1920x1080, 1280x720 e 390x844. Na C1, as tres secoes recusaram
  PIN incorreto, aceitaram 0000 e bloquearam novamente, com fixtures
  temporarias sem URLs de reproducao e sem salvar dados de teste no banco.
- Removido o app `com.lcplay.networktest` da TV. A listagem de aplicativos
  de desenvolvimento ficou somente com `com.lcplay.tv`, atualizado no mesmo
  ID para preservar a ativacao.
- Pacote atualizado: `com.lcplay.tv_0.1.0_all.ipk`. SHA-256:
  `DBCFA94B2F83CC7773CB44233217ED8D217577DA5DBF3C67816D05866EAEB6EA`.
- Relatorios locais: `artifacts/lg-network-validation/native-epg-report.json`
  e `native-parental-report.json`. O runner restaura o fetch original e
  recarrega o app no encerramento, inclusive em falhas.
- Publicacao na VM permanece pendente: o catalogo ainda e baixado/processado
  pelo backend, e o fornecedor recusa essas requisicoes a partir da VM.
  A prova de download completo pela TV ainda nao e uma implementacao de
  catalogo nativo. Nao foi modificado DashboardConecta nem enviado ao Git.

## Catalogo nativo completo e correcao de carregamento (03/10/2026)

Esta etapa substitui a pendencia de catalogo nativo indicada na secao anterior.

- A LG recebe apenas a configuracao autorizada da fonte por
  `v1/device/media/source`, protegida por DeviceTokenGuard e no-store.
  M3U, processamento, paginas, episodios e XMLTV passam pelo servico local
  da TV; nenhum catalogo e solicitado ao backend nesse caminho.
- A primeira implementacao, que processava enquanto recebia a lista,
  falhou na C1 com `ABORTED`. Corrigido para concluir o download em arquivo
  privado antes de processar em lotes. O transporte aguarda inclusive a
  ultima escrita assincrona, antes de declarar o arquivo completo.
- Download limitado a 150 MiB/90 segundos; a interface aguarda ate 110
  segundos pela importacao, incluindo processamento. O arquivo M3U bruto
  e removido depois de gerar o indice. Cache em JSONL, paginas de ate 250
  registros/384 KiB e indice de series evitam devolver todos os episodios
  por uma unica chamada Luna. Atualizacao falha preserva o indice anterior.
- Na C1, duas importacoes completas da fonte vinculada passaram: 91.596.060
  bytes e 305.954 itens em cerca de 68 segundos. Resultado: 2.777 canais,
  21.484 filmes, 6.919 titulos de series e 281.693 episodios indexados.
  Pico RSS registrado pelo servico: aproximadamente 274 MiB; JSONL gerado:
  aproximadamente 118 MiB. Isso nao mede a memoria total do player/TV.
- As tres secoes abriram, os detalhes carregaram os oito episodios da
  primeira serie selecionada e nenhuma chamada ao catalogo do backend
  ocorreu. O numero de itens montados na grade/lista e virtualizado,
  nao um corte do catalogo. Adultos seguem ocultos antes do PIN.
- XMLTV real baixado/processado diretamente na LG, com a consulta da API
  do fornecedor desativada apenas na chamada de teste: programa atual e
  proximo de Globo SP FHD disponiveis. O fluxo normal por canal tambem
  mostrou a mesma programacao. Nenhuma chamada player_api pelo navegador.
- Globo SP FHD iniciou com readyState 4, 1280x720, paused false, muted false
  e nenhum erro. Tela cheia manteve o mesmo elemento de video e nao
  exibiu EPG sobre ele. Imagem/audio fisicos nao foram reconfirmados pelo
  operador nesta rodada; as metricas sao da inspecao do aparelho.
- PIN na C1: TV ao vivo, Filmes e Series iniciaram bloqueados, recusaram
  1111, aceitaram 0000 e voltaram a bloquear. Fixtures temporarias sem
  reproducao, preservando a fonte real e restaurando os adaptadores ao fim.
- Testes locais: 31 da API, 30 do player e seis do transporte/Node 8;
  typecheck/lint da API e player sem erros. EPG e controle parental passaram
  no navegador em 1920x1080, 1280x720 e 390x844. Sintaxe dos dois bundles do
  servico validada para Node 8; XMLTV cobre UTF-8 fragmentado, CDATA, fusos,
  XML invalido, entidades externas e coalescencia/cache.
- Pacote final instalado no mesmo ID, preservando a ativacao. A listagem
  de desenvolvimento contem somente `com.lcplay.tv`. SHA-256:
  `CBF1D15BD31A9BB5277BE90FF8BE5C7BC24566D1F2E7DEB83B1C9D3B57775377`.
- Relatorios: `artifacts/lg-network-validation/native-catalog-report.json`
  e `native-parental-report.json`, sem URLs/credenciais. Para repetir:
  `LG_NATIVE_CATALOG=1` e opcionalmente `LG_NATIVE_CATALOG_FORCE=1` no runner
  `scripts/test-lg-network-service.mjs`.
- O navegador local continua usando o catalogo da API; a implementacao
  Roku nao foi migrada. Fontes Xtream ainda nao sao aceitas neste fluxo LG.
  Nenhuma publicacao na VM, alteracao no DashboardConecta ou envio ao Git.
