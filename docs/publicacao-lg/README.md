# Publicação LG: kit de preparação

Preparado em 01/10/2026; atualizado em 03/10/2026. **Kit local de preparação. Não submetido à LG. Roku somente depois do envio LG.**

Responsável informado pelo proprietário: **Leonardo Pereira**.
Suporte e privacidade: **suportelcplay@gmail.com**.

## Materiais

- [Textos da loja](loja.md): descrição em português e inglês, identidade e campos pendentes.
- [UX Scenario](ux-scenario.md): roteiro baseado no aplicativo real, com instruções para avaliadores em inglês.
- [Matriz de testes](checklist.csv): registro interno; não substitui o formulário oficial.
- [Privacidade](privacidade.md) e [termos](termos.md): propostas com os dados confirmados pelo proprietário e gratuidade nesta versão; revisar antes de publicar.
- [Prévia de suporte e documentos legais](public-site/index.html): textos gerados da mesma fonte do leitor offline da TV; páginas responsivas e com `noindex`.
- [Fonte de demonstração](demonstracao.md): vídeo técnico próprio, M3U e XMLTV dinâmico.
- [Pendências técnicas e operacionais](pendencias.md): bloqueios para uma submissão responsável.
- [Roteiro do Seller Lounge](envio-seller-lounge.md): arquivos, decisões confirmadas e verificações antes de enviar.
- [QA do candidato atual](qa-candidato-2026-10-03.md): hash instalado somente na C1, seguranca, testes fisicos confirmados e limites.
- [Planilha oficial LG 5.0](../../outputs/019dee99-0d76-7cd3-9686-d07823430ee4/lc-play_self_evaluation_draft_5.0.xlsx): rascunho com evidências dos testes locais na C1 e campos de submissão pendentes.

## Situação

| Item | Situação |
| --- | --- |
| App LG em TV física | C1 testada; relato do usuário e evidências em `docs/teste-lg.md` |
| ID atual | `com.lcplay.tv`; confirmar antes de submeter |
| Versão do manifesto | `0.1.0`; pacote, interface e testes padronizados |
| Cadastro Seller Lounge | Proprietário confirmou conta existente e login no navegador interno em 03/10/2026; sem controle dessa aba pelas ferramentas atuais |
| Fonte QA própria | M3U, XMLTV e mídia sintética publicados em HTTPS, separados dos clientes reais |
| Backend acessível pelos avaliadores | API e fonte QA públicas validadas na C1; sem acesso administrativo para avaliadores |
| Termos e privacidade | Páginas HTTPS e leitores offline publicados e testados |
| Acesso de avaliadores | Cinco códigos privados de uso único provisionados até 02/11/2026; ativação física em TV QA separada pendente |
| Modelo comercial | Aplicativo e ativação gratuitos nesta versão |
| Distribuição e idioma | Somente Brasil e português brasileiro; confirmado em 03/10/2026 |
| Infraestrutura declarada | Ascent, Brasil; Cloudflare Tunnel/DNS; suporte Gmail |
| Checklist oficial preenchido | Rascunho gerado com evidências locais; finalizar após a matriz QA |
| Submissão | Não realizada |

## Gerar o material local

```powershell
pnpm install --frozen-lockfile
pnpm lg:store:assets
pnpm lg:store:legal
pnpm lg:store:test
pnpm lg:store:public:package
pnpm lg:store:demo
```

O gerador salva ícones, splash candidato, pôsteres técnicos e MP4/HLS em `artifacts/lg-store/`, que já é ignorado pelo Git. Ele também atualiza `apps/lg-webos/public/splash.png` a partir da mesma marca aprovada. O executável FFmpeg é somente uma ferramenta de desenvolvimento; não é incorporado ao aplicativo da TV.

O servidor usa `127.0.0.1:4180` por padrão. Não altera banco, dispositivos, fontes cadastradas, token da sua TV ou endpoints do player. Para testes na TV, siga as instruções de rede no documento de demonstração. A pasta não deve ser publicada inteira, pois reúne rascunhos internos.

## Referências oficiais

- [Cadastro e tipos de vendedor](https://webostv.developer.lge.com/distribute/app-ecosystem).
- [Processo de aprovação](https://webostv.developer.lge.com/distribute/app-approval-process).
- [Checklist LG](https://webostv.developer.lge.com/distribute/app-self-checklist).
- [Modelos oficiais de QA](https://webostv.developer.lge.com/assets/checklist/documents_for_app_qa.zip).
- [Metadados, ID e ícones](https://webostv.developer.lge.com/develop/references/appinfo-json).
- [Recursos gráficos](https://webostv.developer.lge.com/develop/getting-started/app-resources).
- [Permissões ACG](https://webostv.developer.lge.com/develop/guides/acg-guide).

A LG exige avaliação e documentos próprios. Transferir os resultados para os modelos atuais do Seller Lounge antes da submissão; este kit não simula uma aprovação. O ID não pode ser alterado depois da publicação. Documentos e fonte QA estão públicos; QA final e submissão ao Seller Lounge seguem pendentes.

## Retomada em 02/10/2026

A identidade visual atual foi mantida. O pacote local `0.1.0` passou por instalação, falha e recuperação da API, reprodução HLS/MP4 e navegação na LG C1. Evidências e hash estão em `docs/teste-lg.md`. Os 45 testes do projeto e 7 testes do kit de publicação passaram.

Essa seção descreve o estado histórico de 02/10. A API foi publicada e validada em 03/10; não permanece apenas local. O teste Roku foi adiado expressamente para depois do envio LG.

## Fechamento LG em 03/10/2026

- Suporte, privacidade e termos podem ser lidos antes da ativação e em Ajustes, sem abrir um navegador externo ou depender da rede. Back fecha o documento e restaura o foco.
- Textos de TV/web usam `apps/lg-webos/src/lib/legal-content.json`. Após alterações, executar `pnpm lg:store:legal` e recriar o pacote LG. Prazos de retenção e exclusão são descritos por critérios; não anunciar expurgo automático inexistente. Fazer revisão jurídica e organizar atendimento manual verificável.
- `Back` na entrada foi conectado a `webOS.platformBack()`, respeitando o teclado aberto. Não confundir teste mock/browser com resultado físico.
- `lg-public` é um serviço opcional do Compose, profile `lg-review`, com bind somente `127.0.0.1:4181`. Sua imagem contém apenas documentos e mídia própria; não expõe o kit interno, códigos, banco ou `.env`. Exige aprovação explícita para início.
- O acesso QA de longa duração é restrito a OWNER, LG QA nova e URL exata da fonte própria. Chaves continuam de uso único, inclusive sob concorrência. Não alterar a C1 real nem dados de clientes para esse teste.
- O pacote candidato atual deve passar pela matriz física final e pelos formulários oficiais antes do envio. Não marcar testes prolongados, Magic Remote ou outros modelos como aprovados sem evidência.

Para verificar o leitor e as páginas localmente, manter a prévia Vite do player em `http://127.0.0.1:5173` e executar `pnpm lg:store:verify:support`. As capturas/resultados em `artifacts/lg-store/support-validation` são de navegador, não certificação da LG.

Depois de gerar o IPK de produção e as prévias próprias, `pnpm lg:store:submission:package` reúne o candidato em `artifacts/lg-submission/candidate`, com hashes e um aviso explícito de QA final pendente. Códigos e credenciais privados não entram nessa pasta. Não enviar a pasta inteira como se fosse o checklist oficial concluído.
