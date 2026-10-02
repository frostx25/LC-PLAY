# Política de privacidade LC PLAY

**RASCUNHO LOCAL: não aprovado nem publicado.** Revisar práticas, prazos e fornecedores antes de uso público. Não constitui parecer jurídico ou garantia de conformidade.

Versão de trabalho: 01/10/2026.

## Responsável e contato

Responsável informado: **Leonardo Pereira**. Solicitações sobre dados e suporte: **suportelcplay@gmail.com**. A modalidade de operação, identificação legal e endereço de atendimento devem ser confirmados antes da publicação; não há CNPJ informado neste kit.

## Dados e finalidades

O LC PLAY utiliza o nome atribuído ao dispositivo/cliente e, quando fornecidos ao administrador, e-mail, telefone e observações para cadastro, atendimento e gestão do serviço. Não informe dados sensíveis em observações.

Para ativar e identificar uma TV, o app transmite seu identificador LGUDID e informações disponíveis de modelo, sistema e versão. O servidor deriva um identificador com HMAC; isso é pseudonimização, não anonimização. Mantém também situação, validade e horários de ativação e última conexão para autorização e diagnóstico.

URLs de listas e EPG, e credenciais quando necessárias, permitem obter catálogos e programação. Esses dados são armazenados criptografados no servidor. Senhas administrativas e tokens são representados por hashes no banco; o token necessário à TV é mantido no armazenamento local do aplicativo. Favoritos de canais são armazenados localmente.

Registros de operações administrativas e de ativação podem conter identificação do ator, data, dispositivo, metadados e IP quando registrado. Na versão examinada, a API não recebe eventos de cada título assistido; isso não significa que o fornecedor de vídeo deixe de registrar acesso.

## Fontes e infraestrutura

A API consulta a lista e o EPG; a TV solicita imagens e vídeo diretamente aos endereços da fonte. Esses fornecedores podem receber IP, requisições e informações técnicas, conforme suas próprias práticas. Credenciais presentes em URLs de mídia são necessárias à conexão e não devem aparecer em imagens ou registros públicos.

Provedores de hospedagem e backup podem tratar dados para operação do serviço. **Antes de publicar:** identificar os provedores contratados, países de armazenamento e salvaguardas aplicáveis. Um servidor nos EUA pode envolver transferência internacional; a localização não foi definida nesta etapa.

## Retenção e segurança

**Antes de publicar:** definir e implementar os prazos para cadastros, dispositivos, códigos, auditoria, contatos de suporte e backups, além de um processo de exclusão. Não há rotina completa de expurgo ou exportação implementada na versão examinada. A retenção deve se limitar às finalidades documentadas e às obrigações aplicáveis.

Usamos controles de acesso, hashes e criptografia para os dados descritos. Esses mecanismos não tornam todos os dados anônimos ou eliminam riscos. HTTPS, proteção de segredos, restauração de backups, armazenamento seguro do token e resposta a incidentes precisam ser validados no ambiente de produção.

## Solicitações do titular

O contato acima recebe solicitações de confirmação, acesso, correção, informações sobre compartilhamento e, quando aplicável, exclusão, portabilidade, oposição ou revogação de consentimento. A análise deve respeitar os prazos legais e pode exigir identificação proporcional para evitar exposição de dados a terceiros.

Desconectar a TV remove o token local; **não apaga automaticamente cadastros, auditoria ou backups**. Para tratar esses registros, contate o responsável.

## Pendências de aprovação

Confirmar identidade legal, contato efetivo, endereço, bases legais por finalidade, tratamento de menores, retenção, fornecedores e procedimento de direitos. Não presumir consentimento só porque o aplicativo foi aberto. Publicar a versão aprovada em URL permanente, acessível também pelo app, e registrar suas revisões.

Referências para revisão: [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) e [orientações da ANPD aos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados). O inventário acima foi elaborado a partir do código atual do LC PLAY.
