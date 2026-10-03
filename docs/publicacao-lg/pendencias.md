# Pendências antes da submissão

Revisão iniciada em 01/10/2026 e atualizada com testes do pacote de produção na C1 em 03/10/2026.

## Concluido em producao

- API publica HTTPS em `https://api-lcplay.thxtech.site/api` e painel em `https://lcplay.thxtech.site`, usando Cloudflare Tunnel dedicado na VM. Banco privado, segredos fora do Git e backups iniciais protegidos. Backups externos automatizados e alertas operacionais ainda precisam ser configurados.
- Pacote de producao instalado na C1 e ativacao preservada. Catalogo completo carregado no aparelho por JavaScript Service nativo, sem depender do IP do computador ou do download da lista pelo backend.
- EPG real, audio, tela cheia sem recriar o video, filmes, series e episodios validados contra a API publica.
- Bloqueio adulto validado nas tres secoes: PIN incorreto recusado, `0000` aceito e bloqueio reaplicado. Esses testes nao substituem uma revisao das politicas de conteudo da loja.

## Bloqueios

1. **Acesso de avaliadores:** implementado localmente o propósito `LG_REVIEW`, restrito a OWNER, dispositivos LG QA novos e fonte técnica própria. Códigos até 30 dias, de uso único e revogáveis, sem bypass ou conta administrativa no pacote. Publicar a fonte própria, provisionar as chaves privadas e validar na TV antes de anunciar disponibilidade. Confirmar processo no Seller Lounge; a fila pode exceder o prazo e exigir reemissão.
2. **Privacidade e termos:** leitor offline implementado na ativação e em Ajustes; páginas web e imagem Docker preparados localmente. Proprietário confirmou Leonardo Pereira, suporte, pessoa física em São Paulo, gratuidade e Ascent no Brasil. Publicação aguarda autorização. Conferir textos, atendimento manual de direitos, retenção/backups e contratos de transferências com Cloudflare/Google; não tratar esses textos como parecer jurídico ou garantia de conformidade.
3. **Cadastro e declaração de conteúdo:** proprietário já possui conta e está logado no Seller Lounge. Ferramentas desta sessão não permitem controlar essa aba. Preencher o formulário com o proprietário, usando exclusivamente fonte própria/licenciada e dados verdadeiros. A ausência de listas pré-carregadas não garante aprovação.

## Revisão técnica

- **Token local:** `apps/lg-webos/src/App.tsx` persiste token em `localStorage`. Revisar armazenamento seguro suportado pelas TVs alvo, validade e revogação; criptografar com chave fixa dentro do bundle não resolve o risco.
- **Falha de configuração:** validada na LG C1 em 02/10/2026. Somente `401/403` remove a ativação; com a API indisponível, o limite de 15 segundos abriu a tela inicial, preservou o token e mostrou nova tentativa. Após a API local retornar, `Atualizar` recuperou 306 mil itens e o EPG sem reinstalar ou reativar. Repetir no pacote de submissão apontando para o backend público.
- **Heartbeat:** rejeições agora são tratadas; `401/403` encerra a sessão e falhas transitórias mantêm o aparelho ativado com aviso. Revalidar reconexão na TV.
- **Desconectar versus excluir:** só remove o token local. Há exclusão administrativa de aparelho, mas isso não implementa exclusão/exportação completa do cliente e das cópias de backup. Definir procedimento verificável.
- **ACG:** o manifesto já declara permissões. Confirmar quais grupos são necessários para os métodos realmente chamados e validar em plataforma com enforcement; C1 não cobre modelos recentes.
- **Back, Home e retomada:** Back na entrada agora delega ao sistema LG com `webOS.platformBack()`, sem disparar enquanto o teclado está aberto. Teste unitário e mock no navegador cobrem a chamada; conferir popup físico, suspensão, relaunch, áudio e retomada em cada plataforma declarada.
- **Splash:** candidato 1920 × 1080 integrado localmente ao manifesto com `iconColor`, resolução e descrição. Validar a abertura do pacote final na TV antes da submissão.
- **Versão:** padronizada em `0.1.0` no manifesto, pacote LG e interface, com teste automático contra divergência. Incrementar antes de cada submissão posterior.
- **Proteção por PIN:** bloqueio efetivo validado na C1 com o pacote de producao; revisar persistencia do PIN, reset e comportamento em outros modelos declarados.
- **M3U versus Xtream:** o painel cadastra Xtream, porém o catálogo LG rejeita reprodução Xtream. Textos desta versão anunciam somente M3U.
- **Catálogos e sessões longas:** importacao real na C1 validada com 305.954 itens (aproximadamente 66 segundos e 243 MiB de pico RSS do servico). Navegacao, episodios e reproducao passaram; ainda medir CPU e estabilidade por varias horas, suspensao/retomada e outros modelos. Esse teste nao confirma estabilidade prolongada.
- **Licenças e marca:** conferir avisos das dependências distribuídas, fontes, marca LC PLAY e assets; não reutilizar marca, posters ou imagens de outro player.

## Operação e revisão

Modalidade pessoa física e gratuidade confirmadas; confirmar país de distribuição e idiomas no formulário e recebimento do e-mail de suporte. Fazer revisão jurídica das condições comerciais, privacidade e eventuais transferências internacionais. Depois, capturar a versão final, preencher formulários oficiais, gerar hash do IPK e submeter somente mediante autorização. Não iniciar Roku antes do envio LG.
