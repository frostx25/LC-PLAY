# UX Scenario: LC PLAY LG

**Rascunho interno para transcrever ao modelo LG. Não enviado.**

Aplicativo `com.lcplay.tv`, versão de referência `0.1.0`.
TV física já utilizada: LG OLED55C1PSA, webOS SDK 6.5.3. Não declarar suporte a todos os modelos com base nesse teste.

## Preparação do avaliador

A API está publicada em `https://api-lcplay.thxtech.site/api`. Fonte QA própria, EPG e documentos também publicados e verificados no host do painel em 03/10/2026, sem alterar a fonte ou ativação da C1 do proprietário. A midia QA foi validada na C1 em sessao temporaria com restauracao do catalogo original; a ativacao fisica por chave de avaliacao em dispositivo separado permanece pendente.

Chaves normais mantêm duração máxima de 24 horas. O fluxo publicado `LG_REVIEW`, exclusivo do responsável OWNER, permite até 30 dias somente para dispositivos LG QA novos, sem vínculo anterior, e para a fonte técnica própria. Não há bypass no aplicativo: a mesma ativação, identificação e autenticação são utilizadas.

`scripts/prepare-lg-review-access.mjs` prepara cinco dispositivos QA e salva as chaves em `artifacts/lg-submission/reviewer-access.private.json`, ignorado pelo Git. O arquivo não deve ser publicado. Fornecer as chaves somente nos campos privados destinados aos avaliadores. Cada TV usa uma chave diferente; reinstalação com perda da sessão ou consumo de todas as chaves exige contato com o suporte para desvinculação e nova chave. Confirmar aceitação desse procedimento no Seller Lounge e monitorar a expiração, renovando o acesso quando necessário.

Não inserir neste roteiro público senha administrativa, token de dispositivo, LGUDID ou credenciais de clientes. Cinco chaves provisionadas; teste isolado de API passou sem consumi-las. Falta a validação desse acesso em uma TV de avaliação. Avaliadores nao recebem SSH, painel administrativo nem acesso ao banco; usam somente o app, uma chave propria e os recursos HTTPS de QA.

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
| Suporte e documentos | Abrir Privacidade ou Termos na ativação e em Ajustes | Leitura no app sem internet; rolagem por setas/ponteiro; Back restaura a tela e o foco |
| Recarregar | Usar Recarregar/Atualizar conteúdo | Atualizar configuração e seção, preservando fonte autorizada |
| Desconectar | Usar Desconectar aparelho | Remover token local e voltar à ativação; não é exclusão de dados no servidor |
| Fonte ausente | Testar dispositivo QA sem fonte | Mensagem adequada, sem catálogo de terceiros |
| Suspenso/vencido | Alterar apenas dispositivo QA no painel | Bloquear acesso; conferir mensagem e retomada após regularização |
| Rede indisponível | Interromper e restaurar rede | Falha controlada e recuperação verificável |
| Saída | Back na entrada, Home, suspensão e retomada | Validar na versão webOS alvo; não considerar aprovado só pelo navegador |

## Reviewer instructions (English)

LC PLAY is an M3U player. It does not include a commercial channel or movie subscription. Sources are registered by the service administrator and assigned to a device; the TV user cannot add a playlist directly.

The interface is currently in Brazilian Portuguese. Main menu labels: **TV ao vivo** (Live TV), **Filmes** (Movies), **Séries** (Series), **Recarregar** (Reload) and **Ajustes** (Settings). **Voltar** means Back; **Desconectar aparelho** clears the local activation token.

Use a QA activation code supplied privately with the submission; use a separate code for each TV. Codes are single-use and valid for up to 30 days from issue. The same production activation flow is used, without a hidden review mode or a bypass. After activating, the device session is separate from the code's expiry. If all codes are consumed, expire or installation data is cleared, contact support for a new isolated code. Never use production customer credentials or an admin account. Public services and five isolated reviewer codes are provisioned; QA media playback passed on the C1 through a temporary test-source response, while physical activation with a reviewer code on a separate TV remains pending. Reviewers do not receive SSH, dashboard administrator or database access. Do not submit this draft as completed QA.

The application and activation are free in this version. **Suporte e documentos** provides offline support, privacy and terms. Use Back to close a document without leaving Settings. At the app entry screen, Back delegates to the LG system (exit confirmation on webOS 6+, Home launcher on older supported systems); physical validation remains required.

For Live TV, select a channel once to start the preview with sound. Select the same channel again to enlarge it. Press Back to return to the guide. Movie and series items use the same authorized technical test clip; channel programmes are synthetic XMLTV entries for guide testing, not broadcast schedules. The QA clip contains generated colour patterns, a moving marker and a quiet test tone. Start at low TV volume.

Navigate categories, search, favourites, movie grids, series seasons/episodes and Settings. Record results for arrow keys, OK, Back and pointer navigation separately. The fixture verifies MP4 and finite HLS playback; long-running live streams and additional codecs require separate validation.

Support contact: **suportelcplay@gmail.com**, responsible: **Leonardo Pereira**.

## Evidências

Guardar versão do pacote, hash, modelo/firmware, horário e resultado de cada teste. Prévias de navegador devem ser rotuladas como tal. Copiar os resultados para o UX Scenario e checklist oficiais somente após validação.
