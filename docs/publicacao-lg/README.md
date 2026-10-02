# Publicação LG: kit de preparação

Preparado em 01/10/2026. **Rascunho local. Não submetido à LG.**

Responsável informado pelo proprietário: **Leonardo Pereira**.
Suporte e privacidade: **suportelcplay@gmail.com**.

## Materiais

- [Textos da loja](loja.md): descrição em português e inglês, identidade e campos pendentes.
- [UX Scenario](ux-scenario.md): roteiro baseado no aplicativo real, com instruções para avaliadores em inglês.
- [Matriz de testes](checklist.csv): registro interno; não substitui o formulário oficial.
- [Privacidade](privacidade.md) e [termos](termos.md): rascunhos para revisão, não páginas públicas.
- [Prévia estática de suporte e documentos legais](public-site/index.html): versão responsiva e com `noindex`, servida apenas pelo helper local em `/legal/`.
- [Fonte de demonstração](demonstracao.md): vídeo técnico próprio, M3U e XMLTV dinâmico.
- [Pendências técnicas e operacionais](pendencias.md): bloqueios para uma submissão responsável.
- [Planilha oficial LG 5.0](../../outputs/019dee99-0d76-7cd3-9686-d07823430ee4/lc-play_self_evaluation_draft_5.0.xlsx): rascunho com evidências dos testes locais na C1 e campos de submissão pendentes.

## Situação

| Item | Situação |
| --- | --- |
| App LG em TV física | C1 testada; relato do usuário e evidências em `docs/teste-lg.md` |
| ID atual | `com.lcplay.tv`; confirmar antes de submeter |
| Versão do manifesto | `0.1.0`; pacote, interface e testes padronizados |
| Cadastro Seller Lounge | Pendente; não acessado nem criado nesta etapa |
| Fonte QA própria | Gerador e servidor locais, separados dos clientes reais |
| Backend acessível pelos avaliadores | Bloqueado: API ainda local |
| Termos e privacidade públicos | Bloqueado: rascunhos ainda não aprovados/publicados |
| Acesso de avaliadores | Pendente: ativação temporária requer processo adequado |
| Checklist oficial preenchido | Rascunho gerado com evidências locais; finalizar após a matriz QA |
| Submissão | Não realizada |

## Gerar o material local

```powershell
pnpm install --frozen-lockfile
pnpm lg:store:assets
pnpm lg:store:test
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

A LG exige avaliação e documentos próprios. Transferir os resultados para os modelos atuais do Seller Lounge antes da submissão; este kit não simula uma aprovação. O ID não pode ser alterado depois da publicação. A publicação na VM e a submissão ao Seller Lounge seguem pendentes.

## Retomada em 02/10/2026

A identidade visual atual foi mantida. O pacote local `0.1.0` passou por instalação, falha e recuperação da API, reprodução HLS/MP4 e navegação na LG C1. Evidências e hash estão em `docs/teste-lg.md`. Os 45 testes do projeto e 7 testes do kit de publicação passaram.

Próximos passos: testar a fonte QA isolada na TV, completar Magic Remote e teclas de sistema, suspensão/retomada e reprodução prolongada, finalizar o UX Scenario oficial e preparar o teste na Roku. O backend público HTTPS fica por último, conforme orientação do proprietário.
