# Pendências antes da submissão

Revisão iniciada em 01/10/2026 e atualizada com testes do pacote local na C1 em 02/10/2026.

## Bloqueios

1. **API pública e HTTPS:** `VITE_API_URL` é incorporada no build; o fallback atual é `http://localhost:4100`. O pacote de submissão não pode depender do IP deste computador. Preparar ambiente público, origem webOS restrita, banco privado, segredos próprios, backup e monitoramento. Implantação depende de autorização.
2. **Acesso de avaliadores:** códigos são temporários e de uso único, com validade máxima de 24 horas. A fila de avaliação pode ultrapassar isso. Definir um processo efetivamente utilizável por uma TV LG externa e documentá-lo; não incluir bypass ou conta administrativa no pacote.
3. **Privacidade e termos:** rascunhos não estão hospedados, nem há acesso a eles nas configurações do app. Definir operadores, país, bases legais, retenção e fluxo de direitos antes de publicar.
4. **Cadastro e declaração de conteúdo:** abrir Seller Lounge e confirmar requisitos aplicáveis ao tipo de player. A fonte usada na avaliação deve ser própria ou licenciada; explicar o cadastro administrativo real. A ausência de listas pré-carregadas não garante aprovação.

## Revisão técnica

- **Token local:** `apps/lg-webos/src/App.tsx` persiste token em `localStorage`. Revisar armazenamento seguro suportado pelas TVs alvo, validade e revogação; criptografar com chave fixa dentro do bundle não resolve o risco.
- **Falha de configuração:** validada na LG C1 em 02/10/2026. Somente `401/403` remove a ativação; com a API indisponível, o limite de 15 segundos abriu a tela inicial, preservou o token e mostrou nova tentativa. Após a API local retornar, `Atualizar` recuperou 306 mil itens e o EPG sem reinstalar ou reativar. Repetir no pacote de submissão apontando para o backend público.
- **Heartbeat:** rejeições agora são tratadas; `401/403` encerra a sessão e falhas transitórias mantêm o aparelho ativado com aviso. Revalidar reconexão na TV.
- **Desconectar versus excluir:** só remove o token local. Há exclusão administrativa de aparelho, mas isso não implementa exclusão/exportação completa do cliente e das cópias de backup. Definir procedimento verificável.
- **ACG:** o manifesto já declara permissões. Confirmar quais grupos são necessários para os métodos realmente chamados e validar em plataforma com enforcement; C1 não cobre modelos recentes.
- **Back, Home e retomada:** conferir comportamento na tela inicial, suspensão, relaunch, áudio e retomada em cada plataforma declarada. Não tratar testes de navegador como QA físico.
- **Splash:** candidato 1920 × 1080 integrado localmente ao manifesto com `iconColor`, resolução e descrição. Validar a abertura do pacote final na TV antes da submissão.
- **Versão:** padronizada em `0.1.0` no manifesto, pacote LG e interface, com teste automático contra divergência. Incrementar antes de cada submissão posterior.
- **Proteção por PIN:** há campos no backend, mas não anunciar controle parental funcional sem validar bloqueio efetivo no player.
- **M3U versus Xtream:** o painel cadastra Xtream, porém o catálogo LG rejeita reprodução Xtream. Textos desta versão anunciam somente M3U.
- **Catálogos e sessões longas:** medir memória, CPU, primeira importação, trocas de seção e reprodução contínua. A fixture curta não prova escalabilidade nem estabilidade prolongada.
- **Licenças e marca:** conferir avisos das dependências distribuídas, fontes, marca LC PLAY e assets; não reutilizar marca, posters ou imagens de outro player.

## Operação e revisão

Confirmar modalidade do vendedor, países, idiomas, preço/licença e suporte efetivo. Fazer revisão jurídica das condições comerciais, privacidade e eventuais transferências internacionais. Depois, capturar a versão final, preencher formulários oficiais, gerar hash do IPK e submeter somente mediante autorização.
