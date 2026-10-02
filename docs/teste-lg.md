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
