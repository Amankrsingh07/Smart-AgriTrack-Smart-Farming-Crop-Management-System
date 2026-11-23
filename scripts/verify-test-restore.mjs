/** Run only against a disposable test server, never against the application database. */
import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
const raw=process.env.TEST_DATABASE_URL;
const url=new URL(raw??'');
if(!['127.0.0.1','localhost'].includes(url.hostname)||!/^agritrack_(?:[a-z0-9]+_)*test(?:_[a-z0-9]+)*$/.test(url.pathname.slice(1)))throw Error('Dedicated local test database required');
if(url.password)throw Error('Use an isolated passwordless disposable server or perform the documented login-path restore drill manually. Passwords are never passed on the command line.');
const source=new PrismaClient({datasourceUrl:raw});
const restoreUrl=new URL(raw);restoreUrl.pathname='/agritrack_restore_test';const restored=new PrismaClient({datasourceUrl:restoreUrl.toString()});
const dumpPath='/tmp/agritrack-disposable-restore.sql';
const args=['--no-defaults',`--host=${url.hostname}`,`--port=${url.port||3306}`,`--user=${decodeURIComponent(url.username)}`];
let user;
try{
 user=await source.user.create({data:{name:'DEMO backup fixture',email:`restore-${randomUUID()}@example.test`,passwordHash:'not-a-login-hash'}});
 const report=await source.fertilizerRecommendationHistory.create({data:{userId:user.id,input:{mode:'DEMO',synthetic:true,dataLabel:'DEMO DATA'},result:{mode:'DEMO',synthetic:true,dataLabel:'DEMO DATA',score:{label:'Insufficient data'}}}});
 const content=Buffer.from('%PDF-1.7\nDEMO DATA backup bytes\n%%EOF');
 await source.soilReportAttachment.create({data:{reportId:report.id,filename:'DEMO-fixture.pdf',mediaType:'application/pdf',size:content.length,sha256:createHash('sha256').update(content).digest('hex'),content}});
 const dump=spawnSync('mysqldump',[...args,'--single-transaction','--quick','--hex-blob','--no-tablespaces','--set-gtid-purged=OFF',url.pathname.slice(1)],{maxBuffer:64*1024*1024});
 if(dump.status!==0)throw Error('Disposable dump failed');
 if(/^\s*(USE|CREATE DATABASE)\b/im.test(dump.stdout.toString()))throw Error('Unexpected database-switch directive in dump');
 await fs.writeFile(dumpPath,dump.stdout,{mode:0o600});
 await source.$executeRawUnsafe('CREATE DATABASE IF NOT EXISTS `agritrack_restore_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
 const result=spawnSync('mysql',[...args,'agritrack_restore_test'],{input:dump.stdout});if(result.status!==0)throw Error('Disposable restore failed');
 const snapshot=async db=>({users:await db.user.count(),farms:await db.farm.count(),fields:await db.field.count(),cycles:await db.cropCycle.count(),reports:await db.fertilizerRecommendationHistory.findMany({orderBy:{id:'asc'}}),attachments:(await db.soilReportAttachment.findMany({orderBy:{id:'asc'}})).map(file=>({...file,content:Buffer.from(file.content).toString('hex')}))});
 if(JSON.stringify(await snapshot(source))!==JSON.stringify(await snapshot(restored)))throw Error('Restored counts, relationships or report/attachment snapshots differ');
 console.log('PASS: disposable MySQL dump/restore preserved entity counts, report JSON, relationships and original attachment bytes.');
}finally{if(user)await source.user.delete({where:{id:user.id}});await source.$disconnect();await restored.$disconnect();}
