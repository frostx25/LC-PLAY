# UX Scenario: LC PLAY LG

**Rascunho interno para transcrever ao modelo LG. Não enviado.**

Aplicativo `com.lcplay.tv`, versão de referência `0.1.0`.
TV física já utilizada: LG OLED55C1PSA, webOS SDK 6.5.3. Não declarar suporte a todos os modelos com base nesse teste.

## Preparação do avaliador

Antes de submeter, disponibilizar uma API pública HTTPS e uma fonte QA própria acessível fora da rede local. A fonte QA deve estar vinculada a um dispositivo separado dos clientes reais.

Uma chave é temporária, de uso único e vinculada à plataforma. O painel permite duração de até 24 horas. Não inserir aqui chave, senha administrativa, token de dispositivo, LGUDID ou credenciais de clientes. A fila de análise pode exceder essa duração: definir com o Seller Lounge um processo de ativação testável, documentado e compatível com o fluxo real antes da submissão. Não criar bypass de autenticação no pacote.

## Roteiro em português

| Etapa | Ação | Resultado esperado |
| --- | --- | --- |
| Primeiro uso | Abrir sem ativação | Tela de ativação, sem lista pré-carregada |
| Chave inválida | Informar valor inválido e ativar | Erro compreensível; permitir correção |
| Ativação | Usar chave LG válida para dispositivo QA | Identificar a TV e exibir menu principal |
| Menu | Navegar por setas, OK e cursor | Foco visível e opções selecionáveis |
| TV ao vivo | Abrir categoria e selecionar canal | Lista, prévia e EPG, quando disponível |
| Prévia | Selecionar primeiro canal técnico | Vídeo com áudio; fonte QA usa clipe, não emissão ao vivo |
| Tela cheia | Selecionar novamente o mesmo canal | Ampliar o mesmo vídeo, sem interromper a reprodução |
| Voltar | Usar Back durante tela cheia | Restaurar prévia e foco; sem X ou EPG sobre o vídeo ampliado |
| Favorito | Marcar e desmarcar um canal | Atualizar a seção Favoritos; verificar persistência |
| Busca | Pesquisar parte do nome | Filtrar resultados e tratar busca sem correspondência |
| Filmes | Abrir um filme técnico | Grade e reprodução; Back retorna ao catálogo |
| Séries | Abrir a série técnica e um episódio | Título, temporada, episódios e reprodução |
| Configurações | Abrir conta/dispositivo | Exibir fonte, validade e informações disponíveis |
| Recarregar | Usar Recarregar/Atualizar conteúdo | Atualizar configuração e seção, preservando fonte autorizada |
| Desconectar | Usar Desconectar aparelho | Remover token local e voltar à ativação; não é exclusão de dados no servidor |
| Fonte ausente | Testar dispositivo QA sem fonte | Mensagem adequada, sem catálogo de terceiros |
| Suspenso/vencido | Alterar apenas dispositivo QA no painel | Bloquear acesso; conferir mensagem e retomada após regularização |
| Rede indisponível | Interromper e restaurar rede | Falha controlada e recuperação verificável |
| Saída | Back na entrada, Home, suspensão e retomada | Validar na versão webOS alvo; não considerar aprovado só pelo navegador |

## Reviewer instructions (English)

LC PLAY is an M3U player. It does not include a commercial channel or movie subscription. Sources are registered by the service administrator and assigned to a device; the TV user cannot add a playlist directly.

The interface is currently in Brazilian Portuguese. Main menu labels: **TV ao vivo** (Live TV), **Filmes** (Movies), **Séries** (Series), **Recarregar** (Reload) and **Configurações** (Settings). **Voltar** means Back; **Desconectar aparelho** clears the local activation token.

Use the documented QA activation procedure supplied privately with the submission. Do not use production customer credentials. A pending review activation procedure is a release blocker, not an already available feature.

For Live TV, select a channel once to start the preview with sound. Select the same channel again to enlarge it. Press Back to return to the guide. Movie and series items use the same authorized technical test clip; channel programmes are synthetic XMLTV entries for guide testing, not broadcast schedules. The QA clip contains generated colour patterns, a moving marker and a quiet test tone. Start at low TV volume.

Navigate categories, search, favourites, movie grids, series seasons/episodes and Settings. Record results for arrow keys, OK, Back and pointer navigation separately. The fixture verifies MP4 and finite HLS playback; long-running live streams and additional codecs require separate validation.

Support contact: **suportelcplay@gmail.com**, responsible: **Leonardo Pereira**.

## Evidências

Guardar versão do pacote, hash, modelo/firmware, horário e resultado de cada teste. Prévias de navegador devem ser rotuladas como tal. Copiar os resultados para o UX Scenario e checklist oficiais somente após validação.
