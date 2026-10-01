# Retomada do LC PLAY

Estado salvo em 30/09/2026. Repositório: https://github.com/frostx25/LC-PLAY.git.

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
- Favoritos, histórico, controle parental efetivo e proxy de reprodução continuam pendentes.

## Abrir nesta máquina

As configurações e os dados locais continuam em `C:\Users\leeoc\Desktop\PROJETOS\tv-player-platform`.

```powershell
cd C:\Users\leeoc\Desktop\PROJETOS\tv-player-platform
pnpm docker:up
pnpm dev:core
```

- Painel: http://localhost:3000
- API: http://localhost:4100/api
- Player: http://localhost:5173
- Demonstração: http://localhost:5173/?demo

Não é necessário executar novamente o seed para retomar o banco já preparado. Em uma máquina nova, seguir a instalação do README e configurar os arquivos de ambiente a partir dos exemplos.

As alterações foram desenvolvidas somente localmente. Publicação na VM depende de solicitação do proprietário.
