// Read-only schema/ledger audit. Never migrate, seed or access farmer row contents.
import nextEnv from '@next/env';
import {PrismaClient} from '@prisma/client';
nextEnv.loadEnvConfig(process.cwd());
const raw=process.env.DATABASE_URL;
if(!raw)throw new Error('DATABASE_URL is required for a read-only schema audit.');
const url=new URL(raw);url.searchParams.set('connect_timeout','5');url.searchParams.set('pool_timeout','5');url.searchParams.set('connection_limit','1');
const db=new PrismaClient({datasourceUrl:url.toString(),log:[]});
const tables=['CropProtectionAssessment','CropProtectionPhoto','CropProtectionFollowup','CropProtectionExpertGrant','CropProtectionReview'];
try{
 const migrations=await db.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
 const columns=await db.$queryRaw`SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'CropProtection%' ORDER BY TABLE_NAME, ORDINAL_POSITION`;
 const indexes=await db.$queryRaw`SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'CropProtection%' ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`;
 const foreignKeys=await db.$queryRaw`SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'CropProtection%' AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, COLUMN_NAME`;
 const integrationTables=await db.$queryRaw`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('CropCalendar','CropCalendarActivity','CropCalendarNotification','CropCalendarEvent','Alert','IrrigationSchedule','FertilizerRecommendationHistory','SoilReportAttachment','FertilizerApplication','FertilizerPlan')`;
 const integrationIndexes=await db.$queryRaw`SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('CropCalendarActivity','CropCalendarNotification','Alert','IrrigationSchedule') ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`;
 console.log(JSON.stringify({mode:'READ_ONLY_METADATA',migrations,columns,indexes,foreignKeys,integrationTables,integrationIndexes,missingTables:tables.filter(t=>!columns.some(c=>c.TABLE_NAME===t))},(_,v)=>typeof v==='bigint'?v.toString():v,2));
}catch(error){console.error(JSON.stringify({mode:'READ_ONLY_METADATA',status:'BLOCKED',code:error?.code??error?.errorCode??'CONNECTION_OR_QUERY_FAILED',category:/Can't reach|connect|denied|not permitted|initialize|not found/i.test(error?.message??'')?'CONNECTION_UNAVAILABLE':'QUERY_OR_SCHEMA_UNAVAILABLE',message:'Schema metadata could not be read; no database writes were attempted.'}));process.exitCode=1;}
finally{await db.$disconnect();}
