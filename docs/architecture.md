# Arquitetura inicial

## Fluxo de ativação

1. O administrador cria o dispositivo e escolhe a fonte autorizada.
2. A API emite uma chave legível, válida por tempo limitado e utilizável uma vez.
3. O cliente informa a chave na TV.
4. A TV envia a chave, a plataforma e o identificador oficial do aplicativo naquela plataforma.
5. A API grava somente o HMAC do identificador, invalida a chave e devolve uma credencial exclusiva do dispositivo.
6. A TV usa essa credencial para configuração, catálogo, EPG e reprodução.

## Limites dos aplicativos

- A interface LG é web e usa APIs webOS somente por um adaptador isolado.
- A interface Roku é SceneGraph/BrightScript e compartilha contratos HTTP, não componentes visuais.
- O painel nunca entrega credenciais brutas de fontes depois do cadastro.
- O player recebe URLs de reprodução de curta duração quando esse módulo for implementado.

## Entidades principais

- `Tenant`: conta proprietária; inicialmente existe apenas a LC PLAY.
- `AdminUser`: operador autenticado do painel.
- `Customer`: pessoa ou empresa responsável por um ou mais dispositivos.
- `Playlist`: fonte M3U ou Xtream e EPG opcional.
- `Device`: instalação vinculada a uma plataforma e fonte.
- `ActivationCode`: chave temporária, armazenada por hash.
- `AuditLog`: registro imutável de ações administrativas.

## Próximos módulos

- Importador assíncrono e normalização de catálogo.
- EPG/XMLTV e busca indexada.
- Proxy de reprodução com autorização e limites por sessão.
- Favoritos, histórico, controle parental e diagnóstico remoto.
- Empacotamento e testes em dispositivos LG e Roku reais.
