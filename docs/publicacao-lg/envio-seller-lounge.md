# Roteiro do Seller Lounge

Atualizado em 03/10/2026. Preparacao da primeira versao; nenhum envio realizado.

## Dados confirmados

- LC PLAY, app ID atual `com.lcplay.tv`, versao `0.1.0`.
- Distribuicao somente no Brasil; interface em portugues brasileiro.
- Aplicativo e ativacao gratuitos. Nao inclui assinatura ou catalogo comercial.
- Responsavel: Leonardo Pereira, pessoa fisica em Sao Paulo, Brasil, sem CNPJ.
- Suporte: `suportelcplay@gmail.com`.
- Suporte publico: `https://lcplay.thxtech.site/legal/`.
- Privacidade: `https://lcplay.thxtech.site/legal/privacidade`.
- Termos: `https://lcplay.thxtech.site/legal/termos`.

Confirmar o ID definitivo, a categoria e os campos especificos apresentados
pelo formulario. A C1 testada usa webOS SDK 6.5.3; isso nao comprova suporte
a todos os anos/modelos disponiveis para selecao.

## Arquivos

O candidato local fica em `artifacts/lg-submission/candidate`. Seu manifesto
registra commit, hash e o aviso de QA final pendente. IPK atual validado na C1:

`com.lcplay.tv_0.1.0_all.ipk`

SHA-256: `ed3fe7719bdb132aa20dc74863d2069a813be7355fe39c658cfefde984d1ee2e`.

Esse candidato foi instalado somente na C1; VM e Git continuam na versao
anterior ate nova autorizacao. Resultados e limites em
`qa-candidato-2026-10-03.md`.

O icone `store-icon-400.png` acompanha o candidato. As imagens em
`internal-browser-previews` sao previas internas com fonte mock; nao enviar
como se fossem capturas fisicas ou prova de certificacao. Conferir os campos
e os formatos exigidos pela loja antes de preparar screenshots finais.

A planilha em `outputs/019dee99-0d76-7cd3-9686-d07823430ee4/` foi atualizada
com os testes do candidato em 03/10/2026. Continua sendo rascunho: campos
em branco sao pendentes. N/A indiscriminados de conteudo e teclas foram
retirados. Nao enviar como checklist final. Transcrever `ux-scenario.md`
ao modelo oficial de apresentacao e concluir os testes aplicaveis.

O modelo baixado `ux_scenario_document_4.3.ppt` e um arquivo legado. O
roteiro bilingue esta atualizado em Markdown, mas nao foi transcrito para
esse .ppt: esta maquina nao tem PowerPoint/LibreOffice disponivel para
conversao. Conferir se o Seller Lounge oferece modelo .pptx atual antes
de preencher; nao substituir o arquivo oficial por um rascunho sem aviso.

## Acesso privado de avaliacao

Cinco chaves individuais permanecem em
`artifacts/lg-submission/reviewer-access.private.json`, fora do Git e do
candidato. Expiram em 02/11/2026 UTC e sao de uso unico. Conferir validade
e disponibilidade antes de enviar; a fila de avaliacao pode exigir renovacao.

Fornecer chaves somente no campo privado de instrucoes/acesso de avaliadores.
Nao fornecer senha do painel, SSH, token da C1 ou acesso ao banco. Avaliadores
usam o fluxo normal do aplicativo e somente a fonte tecnica propria:
`https://lcplay.thxtech.site/playlist.m3u`.

## Sequencia

1. Conferir registro do candidato: token cifrado e migrado na C1, permissoes
   minimas e avisos incluidos. Validar outros modelos antes de declara-los.
2. Completar QA fisico: Magic Remote, teclado, Home/standby/retomada,
   perda total de rede e sessao prolongada. Testar ativacao por chave em
   aparelho QA separado, sem desvincular a C1 do proprietario.
3. Finalizar checklist e UX Scenario oficiais com evidencias e screenshots.
4. No Seller Lounge, iniciar o cadastro de aplicativo webOS, verificar os
   campos atuais e preencher dados, pais, idioma, categoria e gratuidade.
5. Anexar IPK, icone, capturas e documentos correspondentes a mesma versao;
   fornecer instrucoes e chaves de avaliacao somente nos campos privados.
6. Conferir todos os dados com o proprietario antes do envio definitivo.

As ferramentas desta sessao nao controlam a aba autenticada do Seller
Lounge. O preenchimento pode ser acompanhado por screenshots do formulario;
nao confundir a preparacao local com cadastro ou submissao realizados.
Roku somente depois do envio LG, conforme orientacao do proprietario.

## Referencias oficiais

- [Processo de aprovacao e documentos exigidos](https://webostv.developer.lge.com/distribute/app-approval-process).
- [Checklist e orientacoes de UX e credenciais](https://webostv.developer.lge.com/distribute/app-self-checklist).
- [Modelos oficiais](https://webostv.developer.lge.com/assets/checklist/documents_for_app_qa.zip).
