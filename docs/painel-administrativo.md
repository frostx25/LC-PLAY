# Painel administrativo LC PLAY

Implementação e testes locais em 01/10/2026. Nenhuma publicação na VM ou no Git faz parte destas alterações.

## Cadastro

Em Dispositivos, Novo dispositivo pede nome, plataforma e fonte. Contato, validade e PIN são opcionais. Sem cliente existente, a API cria um cliente com o nome do dispositivo na mesma transação; nomes iguais não são unidos automaticamente. Vincular a cliente existente mantém o agrupamento de várias TVs. O painel gera uma chave de ativação após cadastrar o dispositivo.

Os dados antigos não são migrados nem renomeados. O cliente continua sendo a referência para contato; editar e-mail ou telefone de um cliente compartilhado afeta todas as TVs desse cliente, com aviso no formulário.

## Edição e renovação

Os ícones de editar, renovar e detalhes ficam na tabela de dispositivos. A edição salva nome, validade, e-mail e telefone. Esvaziar a validade remove o prazo.

Renovar acrescenta 30, 90 ou 365 dias a partir do maior valor entre agora e a validade existente. Um dispositivo expirado com credencial volta a ativo; sem credencial fica aguardando ativação. Suspensos permanecem suspensos. Corrigir manualmente a validade de um dispositivo expirado para uma data futura, ou remover o prazo, também recupera seu status sem gerar outra chave.

## Busca e lote

Busca por nome do dispositivo, cliente, e-mail ou telefone, sem diferenciar acentos. Filtros: cliente, plataforma, status e validade (expirada, próximos 7/30 dias, sem prazo). A expiração pode aparecer antes do próximo heartbeat da TV.

Checkboxes selecionam até 100 dispositivos. Alterar filtros limpa a seleção. Selecionar todos considera os resultados visíveis, limitado a 100. Renovar, suspender e trocar fonte exigem confirmação com os nomes dos dispositivos. As alterações e seus registros são transacionais: uma seleção ou fonte de outra conta é recusada sem aplicação parcial. Renovação e edição usam isolamento serializável para evitar sobrescrever ações concorrentes.

## Fontes e alertas

Em Fontes, Diagnóstico mostra o último resultado e permite Testar M3U e EPG. A M3U é baixada e interpretada com limite de 90 segundos e 150 MiB; o EPG tem limite separado de 20 segundos e 80 MiB. EPG precisa conter programação atual ou futura. EPG não cadastrado é indicado separadamente de uma falha. URLs, senhas e credenciais não são devolvidas no diagnóstico.

O diagnóstico verifica o catálogo e o XMLTV, não a reprodução de cada canal nem seus codecs. Xtream é marcado como não suportado nesta etapa. Uma fonte pausada continua pausada após o teste. O último resultado fica no histórico, com duração e horário. Mudar a configuração durante um teste impede que seu resultado sobrescreva o estado da fonte editada.

Alertas é uma página no próprio painel, acessível pelo menu, sem e-mail ou WhatsApp automático. Mostra validade expirada, vencimentos nos próximos sete dias e fontes com status de erro ou mensagem de falha (incluindo EPG). Os dados são atualizados a cada minuto enquanto a página está aberta. A saúde da fonte reflete os carregamentos e diagnósticos realizados; não há sondagem automática de todas as fontes.

## Detalhes e testes

O modal do aparelho mostra modelo, plataforma, sistema, versão do aplicativo, fonte, validade, ativação, última conexão, contato e ID administrativo. Campos ainda não recebidos do aparelho ficam como Não informado. Exibe até 100 eventos recentes do dispositivo e de seu cliente, incluindo renovações e ações em lote; hashes, PIN e tokens não são expostos.

Verificado em navegador desktop 1440x1000 e celular 390x844. Cadastro automático, edição, renovação, suspensão e troca de fonte em lote, diagnóstico com erro e histórico foram exercitados pelo painel usando dados temporários removidos após a verificação. Testes de API com duas contas temporárias também verificaram o isolamento de contas, contato compartilhado, recuperação de expirados e M3U/EPG válidos e inválidos.

```powershell
pnpm --filter @lc-play/api test
pnpm --filter @lc-play/admin-web test
pnpm --filter @lc-play/api exec tsx scripts/test-admin-flows.ts
pnpm --filter @lc-play/admin-web build
```

O teste de integração exige a API em localhost:4100 e o banco local. Cria e remove somente contas temporárias próprias. Para abrir o painel: http://localhost:3000/devices. Se for necessário iniciar os serviços, use `pnpm dev:core` com Docker disponível; não execute o seed novamente num banco já configurado.
