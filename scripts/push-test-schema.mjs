import { spawnSync } from 'node:child_process';
const raw = process.env.TEST_DATABASE_URL;
if (!raw) throw Error('TEST_DATABASE_URL is required');
const url = new URL(raw);
if (url.protocol !== 'mysql:' || !['localhost','127.0.0.1','mysql'].includes(url.hostname) || !/^agritrack_(?:[a-z0-9]+_)*test(?:_[a-z0-9]+)*$/.test(url.pathname.slice(1))) throw Error('Refusing schema setup outside a dedicated test database');
// Current schema only: legacy migration-chain deployment is deliberately separate.
const child=spawnSync('npx',['prisma','db','push','--skip-generate'],{stdio:'inherit',env:{...process.env,DATABASE_URL:raw}});
process.exitCode=child.status??1;
