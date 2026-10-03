# Pendências antes da submissão

Revisão iniciada em 01/10/2026 e atualizada com testes do pacote de produção na C1 em 03/10/2026.

## Concluido em producao

- API publica HTTPS em `https://api-lcplay.thxtech.site/api` e painel em `https://lcplay.thxtech.site`, usando Cloudflare Tunnel dedicado na VM. Banco privado, segredos fora do Git e backups iniciais protegidos. Backups externos automatizados e alertas operacionais ainda precisam ser configurados.
- Pacote de producao instalado na C1 e ativacao preservada. Catalogo completo carregado no aparelho por JavaScript Service nativo, sem depender do IP do computador ou do download da lista pelo backend.
- EPG real, audio, tela cheia sem recriar o video, filmes, series e episodios validados contra a API publica.
- Bloqueio adulto validado nas tres secoes: PIN incorreto recusado, `0000` aceito e bloqueio reaplicado. Esses testes nao substituem uma revisao das politicas de conteudo da loja.

## Bloqueios

1. **Acesso de avaliadores:** códigos são temporários e de uso único, com validade máxima de 24 horas. A fila de avaliação pode ultrapassar isso. Definir um processo efetivamente utilizável por uma TV LG externa e documentá-lo; não incluir bypass ou conta administrativa no pacote.
2. **Privacidade e termos:** rascunhos não estão hospedados, nem há acesso a eles nas configurações do app. Definir operadores, país, bases legais, retenção e fluxo de direitos antes de publicar.
3. **Cadastro e declaração de conteúdo:** abrir Seller Lounge e confirmar requisitos aplicáveis ao tipo de player. A fonte usada na avaliação deve ser própria ou licenciada; explicar o cadastro administrativo real. A ausência de listas pré-carregadas não garante aprovação.

## Revisão técnica

- **Token local:** `apps/lg-webos/src/App.tsx` persiste token em `localStorage`. Revisar armazenamento seguro suportado pelas TVs alvo, validade e revogação; criptografar com chave fixa dentro do bundle não resolve o risco.
- **Falha de configuração:** validada na LG C1 em 02/10/2026. Somente `401/403` remove a ativação; com a API indisponível, o limite de 15 segundos abriu a tela inicial, preservou o token e mostrou nova tentativa. Após a API local retornar, `Atualizar` recuperou 306 mil itens e o EPG sem reinstalar ou reativar. Repetir no pacote de submissão apontando para o backend público.
- **Heartbeat:** rejeições agora são tratadas; `401/403` encerra a sessão e falhas transitórias mantêm o aparelho ativado com aviso. Revalidar reconexão na TV.
- **Desconectar versus excluir:** só remove o token local. Há exclusão administrativa de aparelho, mas isso não implementa exclusão/exportação completa do cliente e das cópias de backup. Definir procedimento verificável.
- **ACG:** o manifesto já declara permissões. Confirmar quais grupos são necessários para os métodos realmente chamados e validar em plataforma com enforcement; C1 não cobre modelos recentes.
- **Back, Home e retomada:** conferir comportamento na tela inicial, suspensão, relaunch, áudio e retomada em cada plataforma declarada. Não tratar testes de navegador como QA físico.
- **Splash:** candidato 1920 × 1080 integrado localmente ao manifesto com `iconColor`, resolução e descrição. Validar a abertura do pacote final na TV antes da submissão.
- **Versão:** padronizada em `0.1.0` no manifesto, pacote LG e interface, com teste automático contra divergência. Incrementar antes de cada submissão posterior.
- **Proteção por PIN:** bloqueio efetivo validado na C1 com o pacote de producao; revisar persistencia do PIN, reset e comportamento em outros modelos declarados.
- **M3U versus Xtream:** o painel cadastra Xtream, porém o catálogo LG rejeita reprodução Xtream. Textos desta versão anunciam somente M3U.
- **Catálogos e sessões longas:** importacao real na C1 validada com 305.954 itens (aproximadamente 66 segundos e 243 MiB de pico RSS do servico). Navegacao, episodios e reproducao passaram; ainda medir CPU e estabilidade por varias horas, suspensao/retomada e outros modelos. Esse teste nao confirma estabilidade prolongada.
- **Licenças e marca:** conferir avisos das dependências distribuídas, fontes, marca LC PLAY e assets; não reutilizar marca, posters ou imagens de outro player.

## Operação e revisão

Confirmar modalidade do vendedor, países, idiomas, preço/licença e suporte efetivo. Fazer revisão jurídica das condições comerciais, privacidade e eventuais transferências internacionais. Depois, capturar a versão final, preencher formulários oficiais, gerar hash do IPK e submeter somente mediante autorização.
