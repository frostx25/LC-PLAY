# Teste isolado de rede na LG

Este prototipo instala `com.lcplay.networktest` e o JavaScript Service
`com.lcplay.networktest.service`, separados do aplicativo `com.lcplay.tv`.
Nao altera o player principal, a configuracao da fonte, o banco ou a VM.

## Executar

Com a TV pareada como `lg-c1`, banco local acessivel e `apps/api/.env` configurado:

```powershell
node --test scripts/tests/lg-network-service.test.mjs
node scripts/test-lg-network-service.mjs
```

O runner le a fonte vinculada a unica LG OLED55C1PSA do banco e, quando presente,
a fonte `LG C1 - lista alternativa` do mesmo tenant. Descriptografa as URLs
apenas em memoria e passa os parametros ao servico pelo depurador local da TV.
Nao grava as credenciais no pacote, relatorios ou argumentos do shell.

Opcoes: `LG_TEST_DEVICE` escolhe o alias da TV; `LG_NETWORK_FULL_ONLY=1` testa
somente transferencias completas; `LG_NETWORK_EPG_ONLY=1` repete apenas os EPGs
explicitamente configurados. As duas ultimas opcoes sao mutuamente exclusivas.
`LG_NETWORK_SOURCE_URL` permite testar uma fonte temporaria sem consulta ou
alteracao no banco; `LG_NETWORK_EPG_URL` define seu EPG opcional. Passe essas
variaveis somente na sessao do processo, nunca em arquivos ou argumentos.
No teste EPG-only de uma fonte temporaria em `/get.php`, sem EPG informado,
o runner testa o candidato `/xmltv.php` com os mesmos parametros de conta.
Isso e uma verificacao do endpoint convencional, nao uma configuracao salva.

`LG_NETWORK_GUIDE_API=1` verifica a API de guia por canal pelo app diagnostico.
`LG_NATIVE_EPG=1` testa o servico de guia e a interface do LC PLAY instalado,
sem instalar o diagnostico. Nesse modo, `LG_NETWORK_SOURCE_URL` substitui
somente a fonte EPG durante o teste; a vinculacao no banco e preservada.
`LG_NATIVE_PARENTAL=1` testa o PIN 0000 nas tres secoes do app instalado,
com fixtures temporarias sem midia reproduzivel. `LG_NATIVE_CATALOG=1` testa
o catalogo nativo completo, XMLTV, guia por canal, reproducao, tela cheia e
episodios, bloqueando deliberadamente as rotas de catalogo da API. Adicionar
`LG_NATIVE_CATALOG_FORCE=1` repete download e processamento do zero.
Nao usar os modos nativos simultaneamente. Eles restauram os adaptadores
originais de fetch/Luna e recarregam o app
no encerramento, inclusive em falha. A API local deve estar acessivel pela TV.

Resultados e pacote ficam em `artifacts/lg-network-validation`, ignorado pelo
Git. A imagem usa os icones existentes, copiados para essa pasta durante o teste.

## Alcance do teste

- Download por `http`/`https` do Node.js, fora do navegador e sem `fetch`.
- M3U: amostra de 256 KiB ou transferencia completa, limite de 150 MiB/90 s.
- EPG: amostra ou transferencia completa, limite de 80 MiB/90 s.
- Gzip/deflate, redirecionamentos limitados e validacao normal de certificados.
- Verificacao do cabecalho M3U e da raiz XMLTV, bytes recebidos, tempo e memoria
  antes/depois; sem salvar o arquivo inteiro ou devolver URLs ao frontend.
- Monitoramento das requisicoes HTTP do navegador durante o teste.

Validar cabecalhos e transferir o arquivo NAO valida todos os itens ou todo o XML.
Este teste tambem nao mede o pico de memoria nem o custo de montar o catalogo.
A importacao, busca, categorias, episodios, cache e guia precisam de uma etapa
separada de implementacao e testes antes de substituir o backend atual.
O guia e o catalogo nativo ja estao integrados em `apps/lg-webos/service`.
Os modos nativos acima verificam essa integracao separadamente do prototipo
de transferencia. Resultados da C1 estao em `docs/teste-lg.md`; navegador e
Roku continuam com caminhos distintos, e publicacao na VM exige validacao
do ambiente publico.

O servico e uma ferramenta temporaria para Developer Mode, nao uma API de
producao. A integracao definitiva deve restringir chamadas ao dispositivo/fonte
autorizados, validar destinos e redirecionamentos, paginar os resultados e
respeitar o ciclo de vida do servico. O browser preview continua usando a API.

## Encerrar

O runner encerra seu depurador ao terminar. Para remover somente o diagnostico
e voltar ao player, preservando a ativacao do LC PLAY:

```powershell
pnpm exec ares-install --device lg-c1 --remove com.lcplay.networktest
pnpm exec ares-launch --device lg-c1 com.lcplay.tv
```

Referencias oficiais:

- https://webostv.developer.lge.com/develop/guides/js-service-basics
- https://webostv.developer.lge.com/develop/guides/js-service-usage
