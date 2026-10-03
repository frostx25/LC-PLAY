# Pendências antes da submissão

Revisão iniciada em 01/10/2026 e atualizada com testes do pacote de produção na C1 em 03/10/2026.

## Concluido em producao

- Atualizacao autorizada somente na C1 com progresso de importacao, cache de 6 horas e dados de tempo do download. IPK `0.1.0` atual: SHA-256 `599e46def91f51765e58d7cea99ccc86a1977067d4584358e46be30345a045d0`. `native-download-timing-report.json` confirma fonte real, velocidade/tempo decorrido, catalogos completos e cache de navegacao, com ativacao/fonte preservadas. Fonte atual nao informa tamanho total; estimativa de restante validada com HTTP local, nao com outra fonte na TV. Revisao fisica completa, standby e sessao prolongada continuam pendentes; nao confundir resultados dos pacotes anteriores com QA final deste IPK.
- API publica HTTPS em `https://api-lcplay.thxtech.site/api` e painel em `https://lcplay.thxtech.site`, usando Cloudflare Tunnel dedicado na VM. Banco privado, segredos fora do Git e backups iniciais protegidos. Backups externos automatizados e alertas operacionais ainda precisam ser configurados.
- Pacote de producao instalado na C1 e ativacao preservada. Catalogo completo carregado no aparelho por JavaScript Service nativo, sem depender do IP do computador ou do download da lista pelo backend.
- EPG real, audio, tela cheia sem recriar o video, filmes, series e episodios validados contra a API publica.
- Bloqueio adulto validado nas tres secoes: PIN incorreto recusado, `0000` aceito e bloqueio reaplicado. Esses testes nao substituem uma revisao das politicas de conteudo da loja.
- Deploy exclusivo LC PLAY do commit `6daa307` autorizado e concluido em 03/10/2026. Suporte, privacidade, termos e fonte propria publicados; API e lg-public saudaveis. Backup privado completo e imagem de rollback preservados. Banco, painel, DashboardConecta, site principal e ativacao da C1 preservados.
- Cinco aparelhos de avaliacao provisionados com chaves privadas de uso unico ate 30 dias. Teste isolado da API validou ativacao concorrente, suspensao, vencimento, renovacao, fonte ausente e revogacao sem consumir essas cinco chaves. Falta ativacao fisica por chave de avaliacao em dispositivo separado.
- Novo pacote instalado na C1 no IP `192.168.15.4`. Tres leitores offline, rolagem, Back por evento de teclado no elemento focado e restauracao de foco passaram; token mantido. Usuario confirmou depois rolagem por setas, Back documento para Ajustes e popup de saida na Home com o controle fisico. Outros modelos, Magic Remote e demais telas continuam pendentes.
- Fonte QA propria validada na C1 por substituicao temporaria de resposta, sem mudar o cadastro: M3U nativa, canais MP4/HLS, XMLTV, tela cheia sem recriar video, catalogos de dois filmes e uma serie/dois episodios, reproducao de um filme e um episodio. Usuario confirmou imagem e som. Fonte e catalogo originais restaurados. Capturas do inspetor nao mostraram a imagem do video; nao sao prova visual dessa reproducao nem substituem teste em outra TV.

## Bloqueios

1. **Acesso de avaliadores:** `LG_REVIEW` publicado, restrito a OWNER, dispositivos LG QA novos e fonte técnica própria. Cinco códigos até 30 dias emitidos e preservados, de uso único e revogáveis, sem bypass ou conta administrativa no pacote. Midia QA validada na C1; ativacao fisica em dispositivo separado ainda pendente. Confirmar processo no Seller Lounge; a fila pode exceder o prazo e exigir reemissão. Chaves somente nos campos privados de avaliação; nunca fornecer SSH, painel administrativo ou acesso ao banco.
2. **Privacidade e termos:** leitor offline na ativação e em Ajustes e páginas web publicados. Proprietário confirmou Leonardo Pereira, suporte, pessoa física em São Paulo, gratuidade e Ascent no Brasil. Conferir textos, atendimento manual de direitos, retenção/backups e contratos de transferências com Cloudflare/Google; não tratar esses textos como parecer jurídico ou garantia de conformidade.
3. **Cadastro e declaração de conteúdo:** proprietário já possui conta e está logado no Seller Lounge. Ferramentas desta sessão não permitem controlar essa aba. Preencher o formulário com o proprietário, usando exclusivamente fonte própria/licenciada e dados verdadeiros. A ausência de listas pré-carregadas não garante aprovação.

## Revisão técnica

- **Token local:** `apps/lg-webos/src/App.tsx` persiste token em `localStorage`. Revisar armazenamento seguro suportado pelas TVs alvo, validade e revogação; criptografar com chave fixa dentro do bundle não resolve o risco.
- **Falha de configuração:** validada na LG C1 em 02/10/2026. Somente `401/403` remove a ativação; com a API indisponível, o limite de 15 segundos abriu a tela inicial, preservou o token e mostrou nova tentativa. Após a API local retornar, `Atualizar` recuperou 306 mil itens e o EPG sem reinstalar ou reativar. Repetir no pacote de submissão apontando para o backend público.
- **Heartbeat:** rejeições agora são tratadas; `401/403` encerra a sessão e falhas transitórias mantêm o aparelho ativado com aviso. Revalidar reconexão na TV.
- **Desconectar versus excluir:** só remove o token local. Há exclusão administrativa de aparelho, mas isso não implementa exclusão/exportação completa do cliente e das cópias de backup. Definir procedimento verificável.
- **ACG:** o manifesto já declara permissões. Confirmar quais grupos são necessários para os métodos realmente chamados e validar em plataforma com enforcement; C1 não cobre modelos recentes.
- **Back, Home e retomada:** Back na entrada delega ao sistema LG com `webOS.platformBack()`, sem disparar enquanto o teclado está aberto. Usuario confirmou o popup fisico na Home da C1 e Back dos documentos para Ajustes em 03/10/2026. Suspensão, relaunch, áudio e retomada continuam pendentes em cada plataforma declarada.
- **Splash:** candidato 1920 × 1080 integrado localmente ao manifesto com `iconColor`, resolução e descrição. Validar a abertura do pacote final na TV antes da submissão.
- **Versão:** padronizada em `0.1.0` no manifesto, pacote LG e interface, com teste automático contra divergência. Incrementar antes de cada submissão posterior.
- **Proteção por PIN:** bloqueio efetivo validado na C1 com o pacote de producao; revisar persistencia do PIN, reset e comportamento em outros modelos declarados.
- **M3U versus Xtream:** o painel cadastra Xtream, porém o catálogo LG rejeita reprodução Xtream. Textos desta versão anunciam somente M3U.
- **Catálogos e sessões longas:** importacao real na C1 validada com 305.954 itens (aproximadamente 66 segundos e 243 MiB de pico RSS do servico). Navegacao, episodios e reproducao passaram; ainda medir CPU e estabilidade por varias horas, suspensao/retomada e outros modelos. Esse teste nao confirma estabilidade prolongada.
- **Licenças e marca:** conferir avisos das dependências distribuídas, fontes, marca LC PLAY e assets; não reutilizar marca, posters ou imagens de outro player.

## Operação e revisão

Modalidade pessoa física e gratuidade confirmadas; confirmar país de distribuição e idiomas no formulário e recebimento do e-mail de suporte. Fazer revisão jurídica das condições comerciais, privacidade e eventuais transferências internacionais. Depois, capturar a versão final, preencher formulários oficiais, gerar hash do IPK e submeter somente mediante autorização. Não iniciar Roku antes do envio LG.
