# QA do candidato LG em 03/10/2026

Estado: candidato local, instalado sob autorizacao na C1. Nao enviado a LG,
VM ou Git. O backend publico existente foi utilizado sem alterar cadastros.

## Pacote e aparelho

- App: `com.lcplay.tv`, versao `0.1.0`.
- IPK: `apps/lg-webos/artifacts/production/com.lcplay.tv_0.1.0_all.ipk`.
- SHA-256: `ed3fe7719bdb132aa20dc74863d2069a813be7355fe39c658cfefde984d1ee2e`.
- API compilada: `https://api-lcplay.thxtech.site`.
- Modelo fisico: OLED55C1PSA, SDK 6.5.3. Nenhum outro modelo certificado.
- Versao anterior preservada para diagnostico em arquivo privado local.
  Um downgrade para codigo que so le o token antigo nao restaura a sessao
  automaticamente; nao desinstalar nem apagar os dados para testar rollback.

## Resultados desta rodada

| Verificacao | Evidencia | Limite |
| --- | --- | --- |
| Migracao da sessao | C1 preservou fingerprints de token, preferencias e fonte. Texto claro removido; AES-GCM com chave nao exportavel em IndexedDB | Nao e armazenamento protegido por hardware nem defesa contra codigo malicioso no mesmo app |
| Fechar e reabrir | Sessao cifrada recuperada no relaunch fisico sem nova ativacao | Nao e teste de reset de fabrica |
| Permissoes | `getSystemInfo` retornou modelo e SDK na C1; manifesto limitado a `deviceinfo.query` e `systemconfig.query` | C1 nao comprova enforcement ACG em webOS recentes |
| Suporte offline | Suporte, Privacidade, Termos e Licencas abriram na C1 sem rede; Back e foco passaram por eventos do inspetor | Rodada fisica anterior ja confirmou Back; nao generalizar para todas as TVs |
| Magic Remote | Proprietario confirmou ponteiro, clique, rolagem e depois controle inteiro funcionando nesta conversa | Confirmacao manual na C1; nao prova de outros controles/modelos |
| Home e energia | Proprietario confirmou audio parando ao pressionar Home, retomada e ativacao preservada apos desligar/ligar | Nao cobre todos os modos de economia de energia e corte de energia da tomada |
| Busca e audio | Proprietario confirmou pesquisa sem resultado, limpar, teclado somente ao clicar, Voltar preservando foco, volume e Mudo | Inventario completo de teclado e teclas especiais permanece pendente |
| Catalogo | Novo IPK passou importacao real, progresso, filmes, series e repeticao usando o mesmo snapshot/cache na C1 | Seis horas de duracao do cache nao foram medidas nesta rodada |
| Fonte tecnica propria | MP4/HLS, XMLTV, continuidade em tela cheia, dois filmes e uma serie/dois episodios passaram no candidato na C1; fonte/catalogo reais restaurados | Resposta temporaria no app; nao ativacao fisica de avaliador em outro aparelho |
| Navegador | Leitores, concordancia LGUDID, foco e migracao/reload em 1920x1080, 1280x720 e 390x844 | Preview no Edge nao comprova compatibilidade webOS |
| Testes | 44 testes LG, 10 testes de publicacao, typecheck e lint passaram | Nao equivalem a certificacao LG |

O proprietario relatou em 03/10 que assistiu durante quatro horas seguidas,
sem problemas, no dia anterior. Registrar como teste manual da versao anterior:
sem telemetria de CPU/memoria e sem promover esse relato a teste prolongado
do candidato com migracao de sessao e ciclo de suspensao de hoje.

## Seguranca e bibliotecas

A sessao usa nonce aleatorio por gravacao e autenticacao AES-GCM. A chave
nao exportavel e por instalacao, persistida em IndexedDB, sem chave fixa no
bundle. O token so fica disponivel em memoria apos decifrar a sessao.
A migracao conserva a credencial antiga se nao conseguir persistir e validar
a nova, exibindo erro e nova tentativa sem fallback de uso em texto claro.
Nenhum pedido de nova ativacao foi feito para a C1 do proprietario.

O PIN parental continua sendo uma preferencia local, com padrao `0000`.
Nao representa protecao contra alguem com acesso administrativo ao aparelho.
Credenciais HTTP da fonte continuam tendo as limitacoes declaradas na
politica de privacidade; cifrar o token da API nao cifra o trafego da fonte.

`public/THIRD-PARTY-NOTICES.txt` acompanha o pacote e a tela Licencas.
O build gera avisos a partir dos arquivos instalados de React, React DOM,
Scheduler, hls.js, Lucide React, sax e webOSTV.js. Ferramentas de build,
FFmpeg e dependencias exclusivas do servidor nao sao bibliotecas do IPK.

Icone separado da loja exportado em PNG 400x400, opaco e quadrado, sem
alterar logo/icones instalados. Checklist oficial 5.0 atualizado como rascunho:
resultados pendentes permanecem em branco, sem N/A automatico para conteudo,
login por aparelho ou teclas ainda nao testadas.

Referencias: [ACG](https://webostv.developer.lge.com/develop/guides/acg-guide),
[LGUDID](https://webostv.developer.lge.com/develop/references/device-unique-id),
[keymanager3](https://webostv.developer.lge.com/develop/references/keymanager3).
Nao declarar keymanager3/TEE na C1: o app nao utiliza esse servico.

## Pendencias para envio

1. Validar ativacao de avaliador em outro aparelho, sem consumir chaves ou
   desvincular a C1 do proprietario. A API foi testada isoladamente.
2. Completar teclas do teclado virtual, perda total da rede e controles VOD
   da matriz oficial. Reset de fabrica somente em TV QA autorizada.
3. Confirmar modelos/anos declarados, titularidade da marca, recebimento do
   e-mail de suporte e procedimento de atendimento/exclusao/exportacao.
4. Completar checklist e UX Scenario oficiais, screenshots e formulario
   Seller Lounge. Resultados em branco sao pendentes, nao N/A nem Pass.
   O modelo UX baixado e .ppt legado, nao convertido/preenchido nesta maquina;
   roteiro bilingue atualizado disponivel em `ux-scenario.md`.
5. Obter autorizacao especifica antes de sincronizar este candidato com VM/Git
   ou efetivar o envio a LG. Nao iniciar Roku antes do envio LG.
