# Retomada do LC PLAY

Estado iniciado em 30/09/2026 e atualizado em 01/10/2026. Repositório: https://github.com/frostx25/LC-PLAY.git.

## Atualização de 01/10/2026

- A TV ao vivo passou a abrir como tela inicial no player LG, com menu lateral, categorias, lista de canais, prévia e programação no mesmo painel.
- Busca e favoritos de canais foram adicionados ao player. Os favoritos ficam no armazenamento local do aparelho.
- A prévia usa o stream real quando a fonte está configurada. O modo `?demo` mostra somente arte e programação ilustrativas.
- A tela foi conferida no navegador em 1280 x 720 e 1920 x 1080; build e lint do player LG passaram. Reprodução em TV LG real continua pendente.
- Nesta máquina, o checkout está em `C:\Users\leeoc\OneDrive\Documentos\ChatGPT\LCPLAY`. Node e pnpm estão disponíveis; o Docker Desktop estava instalado, mas o serviço não estava ativo. Os arquivos locais de ambiente ainda precisam ser configurados para usar API e banco.

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
- Sete testes da API passaram, cobrindo classificação M3U, episódios, EPG, fuso horário e criptografia.
- Build dos contratos e do player LG.
- Fluxo real de ativação, catálogo e edição da fonte validado no navegador.
- Layout verificado em 1920 x 1080 e 1366 x 768.

## Pontos para continuar

- O catálogo entregue ao aparelho é limitado a 2.000 canais, 1.500 filmes e 5.000 episódios de até 750 séries. Os contadores refletem o total da fonte. Implementar consulta e paginação no servidor para disponibilizar o catálogo completo e todos os episódios.
- A classificação usa metadados, categoria e caminho da URL; revisar formatos adicionais de listas conforme surgirem.
- Testar reprodução na LG real. O stream usado no teste do navegador não reproduziu; a causa ainda precisa ser diagnosticada.
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

Para executar API e painel nesta máquina, seguir a instalação do README, configurar os arquivos de ambiente a partir dos exemplos e iniciar PostgreSQL/Redis. O banco preparado no ambiente anterior não veio com o repositório.

Publicação na VM depende de solicitação do proprietário.
