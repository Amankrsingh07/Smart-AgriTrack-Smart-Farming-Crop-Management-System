import test from "node:test";
import assert from "node:assert/strict";
import { validateSoilAttachment, MAX_SOIL_ATTACHMENT_BYTES } from "../src/lib/soil-attachments";
import { requireTestDatabase } from "../src/lib/test-database-safety";
test("attachment metadata requires compatible extension, media type and magic bytes",()=>{
 const pdf=Buffer.from("%PDF-1.7\nfixture");const meta=validateSoilAttachment(pdf,"../../sample.pdf","application/pdf");assert.equal(meta.mediaType,"application/pdf");assert.ok(!meta.filename.includes("/"));assert.equal(meta.sha256.length,64);
 assert.equal(validateSoilAttachment(Buffer.from([137,80,78,71,13,10,26,10]),"sample.png","image/png").mediaType,"image/png");
 assert.equal(validateSoilAttachment(Buffer.from([255,216,255,224]),"sample.jpeg","image/jpeg").mediaType,"image/jpeg");
 for(const [name,type]of [["sample.html","application/pdf"],["sample.pdf","image/jpeg"],["sample.svg","image/svg+xml"]])assert.throws(()=>validateSoilAttachment(pdf,name,type));
 assert.throws(()=>validateSoilAttachment(Buffer.from("<script>"),"sample.pdf","application/pdf"));
 assert.throws(()=>validateSoilAttachment(Buffer.alloc(0),"empty.pdf","application/pdf"));
 assert.throws(()=>validateSoilAttachment(Buffer.alloc(MAX_SOIL_ATTACHMENT_BYTES+1),"big.pdf","application/pdf"));
});
test("test setup fails closed for application databases and remote URLs",()=>{
 for(const raw of [undefined,"mysql://localhost/agritrack", "mysql://localhost/agritrack_latest","mysql://localhost/agritrack_migration_20261103","mysql://remote/agritrack_soil_test","postgres://localhost/agritrack_test"])assert.throws(()=>requireTestDatabase(raw));
 assert.equal(requireTestDatabase("mysql://localhost/agritrack_soil_test"),"mysql://localhost/agritrack_soil_test");
});
