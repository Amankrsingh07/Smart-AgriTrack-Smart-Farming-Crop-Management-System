import json,re,hashlib,pymupdf as f
from pathlib import Path
import sys
pdf=Path(sys.argv[1]);doc=f.open(pdf)
# Reviewed Bihar table: twelve nutrient columns in Rice/Wheat/Sugarcane/Rabi-Maize order.
rows=[]
for ix in [9,10]:
 for line in doc[ix].get_text(sort=True).splitlines():
  match=re.match(r'^\s*(\d+)\s+(.+?)\s+((?:\d+(?:\.\d+)?\s+){11}\d+(?:\.\d+)?)\s*$',line)
  if not match:continue
  serial=int(match[1]);district=match[2].strip();values=list(map(float,match[3].split()));assert len(values)==12
  for j,(crop,season) in enumerate([('rice',None),('wheat',None),('sugarcane',None),('maize','RABI')]):
   rows.append({'id':f'icar-gfr-2026-bihar-{serial}-{crop}','cropKey':crop,'state':'Bihar','district':district,'zone':None,'season':season,'productionType':'GENERAL_DISTRICT','irrigationCondition':None,'sowingCondition':None,'nutrientsKgHa':dict(zip(['n','p2o5','k2o'],values[j*3:j*3+3])),'originalBasis':'N:P2O5:K2O','recommendationUnits':'kg/ha','sourceId':'ICAR-IISS-GFR-2026','sourcePage':ix+1,'sourceRow':serial,'applicationTiming':[],'verificationStatus':'VERIFIED_STANDARD_GENERAL_DISTRICT','datasetVersion':'2026-11-15.1','conditions':'District-level general standard dose, not a field-specific STCR prescription. Unspecified season, variety, irrigation and sowing conditions are not inferred. Review local applicability and previous fertilizer/organic inputs before application. No application timing is supplied.','phosphorusProduct':'DAP'})
assert len(rows)==152
assert len({r['district'] for r in rows})==38
out={'version':'2026-11-15.1','source':{'id':'ICAR-IISS-GFR-2026','organization':'ICAR-Indian Institute of Soil Science','title':'District-wise general fertilizer recommendations for major crops in India','url':'https://icar-ciah.org/include/pdf/advisory/2026/jun_2026/GFR_district_wise_03062026.pdf','publicationDate':None,'documentReleaseIdentifier':'03062026 in official distribution URL; exact publication date not printed','reviewedOn':'2026-11-15','sha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'scope':'Annexure 1, Bihar district standard doses, printed pp.10–11. Background p.2: district aggregates derived from STCR framework/SHC data, not an executable field STCR model. No timing. Rice FYM credit note is not applied automatically.','organicCreditNote':'Bihar Rice note: 5 t FYM/ha permits source-stated nutrient credits. Material/application applicability must be confirmed; no credit is assumed in the full standard preview.'},'records':rows}
Path('src/data/fertilizer/bihar-gfr-2026.json').write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n')
print('Extracted',len(rows),'reviewed standard district records; Saran:',[(r['cropKey'],r['nutrientsKgHa']) for r in rows if r['district']=='Saran'])
