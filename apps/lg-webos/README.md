# Player LG webOS

Player React/Vite do LC PLAY, com navegação por controle remoto e fontes configuradas pelo painel.

## Desenvolvimento

Execute `pnpm --filter @lc-play/lg-webos dev` na raiz. Configure `VITE_API_URL` no ambiente local; o padrão é `http://localhost:4100`. A demonstração visual está em `http://localhost:5173/?demo`, somente em desenvolvimento.

## Desempenho

- O aparelho solicita apenas a seção aberta (`LIVE`, `MOVIE` ou `SERIES`). Ao trocar de seção, libera o catálogo anterior e cancela a requisição pendente.
- A lista ao vivo renderiza a janela visível e quatro linhas extras de cada lado. O deslocamento mantém a altura total da lista e os índices acessíveis.
- Contagens por categoria e índices de busca são calculados uma vez por catálogo. Filmes e séries exibem 24 cards por página.
- O vídeo começa ao escolher um canal. Busca, categoria e favoritos mantêm o stream selecionado.
- O player nativo tem prioridade. HLS.js é carregado apenas quando necessário, com metas de buffer de 15 segundos, máximo de 30 segundos, sem histórico de buffer. O limite configurado de bytes não representa um limite da memória total da TV.
- Há somente um vídeo em reprodução; fechar ou substituir o player pausa e libera seus recursos.
- Falhas temporárias permitem até duas reconexões e uma recuperação de decodificação por tentativa. Após falha persistente, a prévia e a tela cheia mostram uma mensagem e um botão para tentar novamente. A ausência de imagem com áudio em andamento também é detectada, exceto para canais identificados como rádio.

A API ainda limita o catálogo retido a 2.000 canais, 1.500 filmes e 5.000 episódios de até 750 séries. A paginação completa no servidor continua pendente.

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
