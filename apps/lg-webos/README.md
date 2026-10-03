# Player LG webOS

Player React/Vite do LC PLAY, com navegação por controle remoto e fontes configuradas pelo painel.

## Desenvolvimento

Execute `pnpm --filter @lc-play/lg-webos dev` na raiz. Configure `VITE_API_URL` no ambiente local; o padrão é `http://localhost:4100`. A demonstração visual está em `http://localhost:5173/?demo`, somente em desenvolvimento.

## Instalar em TV real

O procedimento está em [../../docs/teste-lg.md](../../docs/teste-lg.md). Execute `pnpm --filter @lc-play/lg-webos package:tv` para gerar `artifacts/com.lcplay.tv_0.1.0_all.ipk` dentro desta aplicação.

O pacote usa `vite.tv.config.ts`, entrada HTML clássica e JavaScript IIFE em `dist-tv`. Na LG C1 com webOS 6.5.3, scripts ES module em arquivos locais falharam por MIME vazio antes de renderizar a interface. O build de TV não depende desse carregamento; o build web normal continua separado. HLS.js fica incorporado ao bundle da TV, enquanto o build web mantém o carregamento sob demanda.

A biblioteca oficial `webOSTV.js` 1.2.13 e sua licença ficam em `public/vendor`. A identidade usa o LGUDID real quando executado no aparelho, sem substituir erros por uma identidade de navegador.

## Catálogo nativo (03/10/2026)

O pacote inclui o JavaScript Service `com.lcplay.tv.guide`, compatível com Node 8 da C1. O player autenticado consulta `v1/device/media/source` para obter somente a fonte vinculada ao aparelho. A API valida ativação, validade e vínculo; não baixa a lista nessa rota.

Na LG, o serviço baixa a M3U diretamente por `http`/`https`, grava um arquivo temporário privado e depois processa em lotes. O parser é o mesmo da API, compilado pelo comando `build:service`. O catálogo fica em arquivos JSONL em `/tmp/com.lcplay.tv.catalog`; resultados são enviados em páginas pequenas pelo Luna. Séries usam um índice de títulos e carregam todos os episódios somente ao abrir os detalhes. Reiniciar a TV elimina esse cache temporário.

O serviço aplica limite de 150 MiB e 90 segundos ao download. O frontend aguarda até 110 segundos pela importação completa, incluindo processamento. Requisições simultâneas compartilham uma importação; o cache vale cinco minutos, e Recarregar força uma nova importação. Atualizações só substituem o catálogo após sucesso. Desconectar ou perder autorização limpa o cache local. URLs com credenciais não devem ser gravadas em logs ou relatórios.

O EPG é consultado pelo mesmo serviço, por canal: API do fornecedor quando disponível, com XMLTV nativo como alternativa. Vídeo e capas continuam sendo acessados diretamente pela TV. O navegador de desenvolvimento continua usando o catálogo da API; a integração não migra o Roku.

## Desempenho

- A interface carrega somente a seção aberta (`LIVE`, `MOVIE` ou `SERIES`) e mantém as seções recentes em cache. Trocar de seção cancela a resposta pendente, sem interromper uma importação compartilhada no serviço.
- A lista ao vivo renderiza a janela visível e quatro linhas extras de cada lado. O deslocamento mantém a altura total da lista e os índices acessíveis.
- Contagens por categoria e índices de busca são calculados uma vez por catálogo. Filmes e séries usam rolagem contínua virtualizada, com cinco colunas na TV.
- O vídeo começa ao escolher um canal. Busca, categoria e favoritos mantêm o stream selecionado.
- O player nativo tem prioridade. HLS.js é carregado apenas quando necessário, com metas de buffer de 15 segundos, máximo de 30 segundos, sem histórico de buffer. O limite configurado de bytes não representa um limite da memória total da TV.
- Há somente um vídeo em reprodução; fechar ou substituir o player pausa e libera seus recursos.
- Falhas temporárias permitem até duas reconexões e uma recuperação de decodificação por tentativa. Após falha persistente, a prévia e a tela cheia mostram uma mensagem e um botão para tentar novamente. A ausência de imagem com áudio em andamento também é detectada, exceto para canais identificados como rádio.

Não há os antigos cortes de canais, filmes, títulos ou episódios. Toda a lista válida e única é indexada, respeitando o limite de tamanho do arquivo. Categorias adultas permanecem bloqueadas e ocultas das buscas/favoritos até autorizar com PIN; o inicial é `0000`.

## Compatibilidade inicial

O build usa Chromium 68 como alvo, correspondente ao webOS 5 (2020). Há alternativas de layout para `min`/`clamp`, espaçamento flex e foco por controle remoto. A tabela oficial de engines está em https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine.

Esse alvo de compilação não confirma compatibilidade em hardware. Instalação, identidade do aparelho, reprodução nativa, codecs, navegação e uso prolongado precisam ser validados numa LG real. webOS 4 e anteriores exigem uma estratégia adicional de compatibilidade para o bundle e ainda não fazem parte do alvo validado.

## Verificação local em 01/10/2026

- Lista real: 12 linhas no início e 16 durante navegação, em 1280 x 720, para 2.000 canais disponíveis na seção.
- Resposta inicial: 1.305.441 bytes para TV ao vivo, comparados a 3.809.390 bytes do catálogo combinado (66% menor; JSON sem compressão).
- Navegação por setas passou da primeira janela sem perder o foco. Canal HD reproduziu em 1280 x 720; limpar a busca manteve a reprodução.
- Globo SP HD e FHD reproduziram em 1280 x 720; UHD reproduziu em 1920 x 1080 e avançou por mais de 50 segundos sem erro observado. A versão H265 enviou HEVC + AAC e reproduziu sem imagem no navegador; a mensagem de incompatibilidade foi validada. As respostas da lista e dos segmentos desses canais foram HTTP 200 com CORS permitido nesta verificação. Isso não exclui quedas intermitentes da fonte nem confirma H.265 numa LG real. A recuperação automática ainda precisa ser exercitada durante uma interrupção real.
- Os testes de janela virtual e seleção de seção passaram, juntamente com lint, typecheck e build.

Os números descrevem o teste no navegador desta máquina, não uma medição de RAM ou FPS numa TV.
