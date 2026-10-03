import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'artifacts/lg-submission/candidate');
const manifest = JSON.parse(await readFile(resolve(root, 'apps/lg-webos/public/appinfo.json'), 'utf8'));
const validation = JSON.parse(await readFile(resolve(root, 'artifacts/lg-store/support-validation/report.json'), 'utf8'));
if (!validation.passed) throw new Error('Run pnpm lg:store:verify:support successfully before preparing a candidate.');
const files = [
  [`apps/lg-webos/artifacts/production/${manifest.id}_${manifest.version}_all.ipk`, `${manifest.id}_${manifest.version}_all.ipk`],
  ['artifacts/lg-store/assets/store-icon-400.png', 'store-icon-400.png'],
  ...['loja.md', 'ux-scenario.md', 'checklist.csv', 'pendencias.md', 'privacidade.md', 'termos.md'].map((name) => [`docs/publicacao-lg/${name}`, `documents/${name}`]),
  ...['01-home-browser-preview.png', '02-live-browser-preview.png', '03-movies-browser-preview.png', '04-series-browser-preview.png', '05-settings-browser-preview.png'].map((name) => [`artifacts/lg-store/previews/${name}`, `internal-browser-previews/${name}`]),
];
const hashes = [];
for (const [source, destination] of files) {
  const data = await readFile(resolve(root, source));
  const path = resolve(output, destination);
  await mkdir(dirname(path), { recursive: true });
  await copyFile(resolve(root, source), path);
  hashes.push({ file: destination, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim());
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({
  status: 'LOCAL_CANDIDATE_NOT_SUBMITTED_NOT_FINAL_QA',
  generatedAt: new Date().toISOString(),
  appId: manifest.id,
  version: manifest.version,
  sourceCommit: commit,
  includesUncommittedChanges: dirty,
  apiOrigin: 'https://api-lcplay.thxtech.site',
  operator: 'Leonardo Pereira',
  support: 'suportelcplay@gmail.com',
  pricing: 'App and activation free in this version; no content subscription included.',
  files: hashes,
}, null, 2) + '\n');
await writeFile(resolve(output, 'LEIA-ANTES-DE-ENVIAR.txt'), `LC PLAY ${manifest.version} - candidato LOCAL, NAO ENVIADO A LG.

Pacote com API HTTPS de producao, suporte e documentos offline.
As capturas em internal-browser-previews sao previas com fonte tecnica propria e API mock, nao evidencia de teste fisico nem aprovacao LG.
Os documentos e checklist sao propostas; nao substituir o checklist oficial com resultados ainda nao executados.

Antes do envio:
1. Autorizar a atualizacao exclusiva do LC PLAY na VM e publicar paginas/fonte QA.
2. Provisionar e testar chaves QA privadas, sem alterar a C1 do proprietario.
3. Revalidar pacote final na C1: ativacao, MP4/HLS/EPG, Magic Remote, Back, Home, suspensao/retomada e sessao prolongada.
4. Revisar token local, permissoes, licencas de terceiros e procedimentos manuais de dados/backups.
5. Concluir UX Scenario e checklist OFICIAIS, revisar metadados e executar envio no Seller Lounge.

Chaves, tokens e senhas NUNCA acompanham este pacote publico. O provisionamento de acesso salva outro arquivo PRIVADO fora desta pasta.
Nao iniciar Roku antes do envio LG, conforme orientacao do proprietario.
`);
console.log(`Local LG candidate prepared: ${output}. Not submitted; final physical QA and public reviewer access remain pending.`);
