# Fonte QA isolada

Esta fixture usa apenas marca LC PLAY, padrões visuais em movimento e áudio sintetizado localmente. Não baixa nem redistribui filmes ou canais de terceiros. Não está vinculada automaticamente a qualquer cliente ou TV.

## Gerar e abrir

```powershell
pnpm lg:store:assets
pnpm lg:store:demo
```

Servidor local: http://127.0.0.1:4180/.
M3U: http://127.0.0.1:4180/playlist.m3u.
EPG: http://127.0.0.1:4180/epg.xml.

O gerador cria MP4 de 16 segundos, H.264/AAC, 1280 × 720, e HLS finito do mesmo clipe. Há dois itens de TV, dois filmes técnicos e dois episódios da série de teste. São repetições intencionais de um clipe técnico, não obras distintas nem canais reais. O XMLTV contém horários ilustrativos gerados a cada requisição para evitar programação vencida.

O áudio é um tom de teste de baixo volume: começar com a TV em volume baixo. Validar MP4 e HLS, imagem, áudio e guia. Isso não cobre DRM, áudio multicanal, live HLS contínuo, todas as resoluções nem reprodução prolongada.

## Acessar na TV

O padrão loopback atende apenas este computador. Para um teste LAN, confirme o IP atual e abra um terminal separado:

```powershell
$env:LG_REVIEW_HOST = "0.0.0.0"
$env:LG_REVIEW_BASE_URL = "http://IP-ATUAL-DO-PC:4180"
pnpm lg:store:demo
```

A fonte passará a publicar URLs desse IP. A API precisa alcançar M3U/EPG; a TV precisa alcançar capas/vídeo. Se a API estiver em contêiner, use um endereço alcançável pelo contêiner, não seu próprio localhost. O helper não abre firewall; se necessário, permitir TCP 4180 só na rede privada/TV. Nunca encaminhar essa porta no roteador nem usar o servidor de fixture como produção.

Criar **outro dispositivo QA** no painel e cadastrar a M3U/EPG acima. Não substituir a fonte da C1 em uso. Na mesma TV, instalar/ativar outro pacote implica planejar a identidade e preservar o cadastro existente; nesta etapa não se reinstala nem se troca a fonte da TV.

Parar com `Ctrl+C`. Remover as duas variáveis no terminal antes de voltar ao modo loopback. O servidor não tem login e serve somente arquivos técnicos permitidos; não fornece API administrativa.

## Direitos e publicação

`rights.json` registra geração local e hash do clipe. Os patterns não contêm obras comerciais; os pôsteres usam a marca existente e textos técnicos. FFmpeg é uma ferramenta de geração, não parte do IPK.

Para avaliação externa, hospedar apenas a fonte QA aprovada, via HTTPS estável, e conferir enquadramento de conteúdo no Seller Lounge. O helper LAN não resolve a ativação nem a disponibilidade pública. A demonstração não vem pré-carregada no app de produção.

## Capturas internas

Com o player web local em execução:

```powershell
pnpm --filter @lc-play/lg-webos dev --host 127.0.0.1 --port 5173 --strictPort
pnpm lg:store:capture
```

O capturador usa o Microsoft Edge instalado na máquina e uma sessão isolada com respostas de API simuladas. Não acessa o banco nem utiliza um token real. Defina `LG_PREVIEW_BROWSER_CHANNEL` somente se precisar usar outro canal suportado pelo Playwright.

Prévias PNG e relatório de procedência ficam em `artifacts/lg-store/previews/`. Não declarar esses arquivos como capturas de TV física nem como testes de backend real. Para submissão, recapturar o app final e validar todos os cenários na LG.
