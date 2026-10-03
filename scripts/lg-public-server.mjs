import { createPublicReviewServer } from './lg-review-server.mjs';

if (process.env.LG_PUBLIC_RELEASE_APPROVED !== '1') {
  throw new Error('Public legal/QA release requires explicit approval: LG_PUBLIC_RELEASE_APPROVED=1.');
}
const port = Number(process.env.PORT || 4180);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
const server = createPublicReviewServer({ baseUrl: process.env.LG_PUBLIC_BASE_URL || 'https://lcplay.thxtech.site' });
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '0.0.0.0', () => console.log(`LG public support/technical QA on port ${port}. No admin or customer data.`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
