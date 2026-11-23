// Authored summaries. Reference photos remain at their institutional sources.
export const harvestRiskVersion="2026-11-18.2";

export type RiskProfile={
 id:string;name:string;scientificName:string;crops:readonly string[];
 kind:"pest"|"disease";phase:"field"|"storage";signs:readonly string[];
 conditions:string;stage:string;prevention:string;inspection:string;recovery?:string;
 source:string;referenceImages?:string;version:string;applicability:string;units:string;
};

const tnau="https://agritech.tnau.ac.in/crop_protection/";
const fieldPest=(id:string,name:string,scientificName:string,crops:string[],signs:string[],stage:string,source:string,conditions="",prevention="Inspect the crop regularly.",photos=true):RiskProfile=>({
 id,name,scientificName,crops,kind:"pest",phase:"field",signs,stage,conditions,prevention,
 inspection:"Show a close-up of the affected part to your local agricultural adviser.",
 source,referenceImages:photos?source:undefined,version:harvestRiskVersion,applicability:"Field scouting for the listed crops.",units:"Qualitative signs",
});

const produceRisk=(id:string,name:string,scientificName:string,crops:string[],kind:RiskProfile["kind"],signs:string[],conditions:string,source:string,referenceImages:string|undefined,prevention:string):RiskProfile=>({
 id,name,scientificName,crops,kind,phase:"storage",signs,conditions,stage:"After harvest",prevention,
 inspection:"Keep affected produce separate and ask a local adviser to inspect it.",
 recovery:"Check the remaining produce for new damage.",
 source,referenceImages,version:harvestRiskVersion,applicability:"Stored harvests of the listed crops.",units:"Qualitative signs",
});

export const additionalHarvestProfiles:readonly RiskProfile[]=[
 fieldPest("wheat-grain-aphid","English grain aphid","Sitobion avenae",["Wheat","Barley"],["Small aphids feeding on grain heads"],"Grain filling",
  "https://extension.okstate.edu/programs/digital-diagnostics/insects-and-arthropods/english-grain-aphid-sitobion-avenae","Often seen late in the growing season.","Check grain heads and protect beneficial insects."),
 fieldPest("cotton-jassid","Cotton leafhopper","Amrasca biguttula",["Cotton"],["Leaf edges yellow or curl down"],"Vegetative",tnau+"cotton/crop_prot_crop_insectpest%20_cotton_10.html","","Inspect the underside of leaves."),
 fieldPest("chilli-thrips","Chilli thrips","Scirtothrips dorsalis",["Chilli"],["Young leaves curl up and become crinkled"],"Vegetative",tnau+"crop_prot_crop_insect-veg_chillies_pest%26disease.html","","Inspect new leaves and flower buds."),
 fieldPest("pea-aphid","Pea aphid","Acyrthosiphon pisum",["Peas"],["Green aphids on growing tips"],"Flowering","https://www.uidaho.edu/extension/food/ipm/ag-pests/pea-aphid","","Check flowering plants for colonies."),
 fieldPest("mango-hopper","Mango hopper","Idioscopus clypealis",["Mango"],["Small hoppers on flower clusters"],"Flowering","https://databases.nbair.res.in/insectpests/Idioscopus-clypealis.php","","Inspect flowering shoots."),
 fieldPest("maize-armyworm","Fall armyworm","Spodoptera frugiperda",["Maize"],["Ragged leaf holes and droppings in the whorl"],"Vegetative",
  "https://icar.gov.in/sites/default/files/2025-10/ICAR-En-Kharif-Agro-Advisories-for-Farmers-2025.pdf","Inspect young maize as new leaves open.","Inspect young plants regularly.",false),
 fieldPest("mustard-aphid","Mustard aphid","Lipaphis erysimi",["Mustard"],["Clusters of small insects on flower shoots"],"Flowering",tnau+"crop_prot_ipm_mustard.html","","Inspect flower shoots for clusters.",false),
 fieldPest("potato-tuber-moth-field","Potato tuber moth","Phthorimaea operculella",["Potato"],["Tunnels in leaves or around the eyes of tubers"],"Vegetative",tnau+"potato/potato_2.html","Exposed tubers are vulnerable.","Keep developing tubers covered with soil."),
 fieldPest("onion-thrips","Onion thrips","Thrips tabaci",["Onion"],["Silvery patches on leaves"],"Vegetative",tnau+"crop_prot_crop_insect-veg_onion_pest%26disease.html","","Check inside leaf folds."),
 fieldPest("sugarcane-shoot-borer","Early shoot borer","Chilo infuscatellus",["Sugarcane"],["Dead centre shoots on young cane"],"Vegetative","https://agritech.tnau.ac.in/govt_schemes_services/aas/sugarcane_ex.html","","Check the base of young shoots."),
 fieldPest("chickpea-pod-borer","Gram pod borer","Helicoverpa armigera",["Chickpea"],["Holes in pods and damaged seeds"],"Pod formation","https://ppqs.gov.in/sites/default/files/chickpea.pdf","","Inspect flowers and pods.",false),
 fieldPest("pigeon-pea-pod-borer","Gram pod borer","Helicoverpa armigera",["Pigeon pea"],["Holes in pods and damaged seeds"],"Pod formation",tnau+"crop_prot_crop_insect_pul_red%20gram.html","","Inspect flowers and pods."),
 fieldPest("groundnut-leaf-miner","Groundnut leaf miner","Aproaerema modicella",["Groundnut"],["Brown mines and webbed leaflets"],"Vegetative","https://agritech.tnau.ac.in/govt_schemes_services/aas/groundnut_ex1.html","","Ask your adviser about rotating with a non-legume crop."),
 fieldPest("soybean-stem-fly","Soybean stem fly","Melanagromyza sojae",["Soybean"],["Small tunnels inside young stems"],"Vegetative",tnau+"soyabean/crop_prot_crop_insect_pulsh_soyabean_9.html","","Inspect leaves and stems of young plants."),
 fieldPest("brinjal-borer","Brinjal shoot and fruit borer","Leucinodes orbonalis",["Brinjal"],["Wilted shoot tips and holes in fruit"],"Vegetative and fruiting","https://agritech.tnau.ac.in/govt_schemes_services/aas/brinjal_ex.html","","Remove affected shoots and fruits with local advice."),
 fieldPest("diamondback-moth","Diamondback moth","Plutella xylostella",["Cabbage","Cauliflower"],["Pale scraped patches and holes in leaves"],"Vegetative",tnau+"colecrop/cole_1.html","","Clear old crop debris after harvest."),
 fieldPest("banana-borer","Banana pseudostem borer","Odoiporus longicollis",["Banana"],["Stem holes with sap or dark material"],"Vegetative",tnau+"crop_prot_crop_insectpest%20_-Banana_pest%26disease.html","","Use planting material free of pest damage."),
 produceRisk("groundnut-storage-borer","Groundnut pod borer in storage","Caryedon serratus",["Groundnut"],"pest",["Holes in pods and damaged kernels"],
  "Eggs may be laid on pods before or during storage.","https://agritech.tnau.ac.in/org_farm/orgfarm_prac_agri_groundnut_storage.html",undefined,"Check pods before storage and separate damaged lots."),
 produceRisk("stored-seed-mold","Mold in stored seeds","Aspergillus spp. / Penicillium spp.",["Mustard","Groundnut","Chickpea","Pigeon pea","Peas","Soybean"],"disease",["Discolored or moldy seed"],
  "Moisture in stored pulses and oilseeds can support mold growth.","https://www.fao.org/4/X5036E/x5036E0P.HTM",undefined,"Check seed moisture and keep moldy lots separate."),
 produceRisk("mango-storage-anthracnose","Mango anthracnose","Colletotrichum gloeosporioides",["Mango"],"disease",["Sunken black spots on ripening fruit"],
  "Infections that start in the orchard can become visible during ripening.","https://www.agritech.tnau.ac.in/crop_protection/crop_prot_postharvest_mango_1.html","https://agritech.tnau.ac.in/horticulture/pdf/tech_bulletin/national/IPM-Mango-Revised-Sept2011.pdf","Sort ripening fruit and keep affected fruit apart."),
 produceRisk("banana-storage-anthracnose","Banana anthracnose","Colletotrichum musae",["Banana"],"disease",["Dark sunken spots on ripening bananas"],
  "Symptoms can emerge during ripening.","https://agritech.tnau.ac.in/crop_protection/crop_diseases_postharvest_banana_1.html","https://agritech.tnau.ac.in/crop_protection/crop_diseases_postharvest_banana_1.html","Handle fruit gently and separate affected fruit."),
 produceRisk("cabbage-storage-rot","Bacterial soft rot","Pectobacterium spp. and other bacteria",["Cabbage"],"disease",["Wet, soft areas on leaves"],
  "Damage during handling can allow decay to spread.","https://extension.sdstate.edu/bacterial-soft-rot","https://www.fao.org/4/i2678e/i2678e00.pdf","Avoid bruising and separate decaying heads."),
 produceRisk("pulse-beetle","Pulse beetle","Callosobruchus chinensis / C. maculatus",["Chickpea","Pigeon pea","Peas","Soybean"],"pest",["Small round holes in dried pulses"],
  "Eggs can be carried in from the field.","https://www.agritech.tnau.ac.in/crop_protection/crop_prot_crop_sto_insect_primary_pest_5.html","https://www.agritech.tnau.ac.in/crop_protection/crop_prot_crop_sto_insect_primary_pest_5.html","Inspect dried pulses before storage and keep affected lots separate."),
 produceRisk("small-grain-storage-mold","Grain storage mold","Aspergillus spp. / Penicillium spp.",["Rice","Wheat","Barley"],"disease",["Discolored or moldy grain"],
  "Damp grain and warm storage favor mold growth.","https://publications.mgcafe.uky.edu/sites/publications.ca.uky.edu/files/id3.htm","https://ipm.illinois.edu/diseases/rpds/119.pdf","Check grain moisture before storage and ask about testing suspected mold."),
 produceRisk("rice-weevil","Rice weevil","Sitophilus oryzae",["Rice","Wheat","Maize","Barley","Sorghum"],"pest",["Small beetles with snouts and holes in grain"],
  "Stored whole grains can carry insects from earlier lots.","https://entomology.k-state.edu/doc/finished-chapters/s156-ch-02-biol-stored-gr-ins-mar1.pdf","https://entomology.k-state.edu/doc/finished-chapters/s156-ch-02-biol-stored-gr-ins-mar1.pdf","Inspect grain as it arrives and clean the store before filling."),
 produceRisk("potato-tuber-moth-store","Potato tuber moth","Phthorimaea operculella",["Potato"],"pest",["Tunnels around the eyes of tubers"],"Exposed tubers can carry damage into storage.",tnau+"potato/potato_2.html","https://ipm.ucanr.edu/PMG/C607/m607tptuberdmg.html","Inspect tubers before storage and keep damaged ones separate."),
 produceRisk("maize-storage-mold","Aspergillus storage mold","Aspergillus spp.",["Maize"],"disease",["Yellow-green mold on damaged kernels"],"Damaged grain is more vulnerable during storage.","https://extension.umn.edu/agriculture/crop-production/corn/corn-ear-rots-and-mycotoxins","https://extension.umn.edu/agriculture/crop-production/corn/corn-ear-rots-and-mycotoxins","Inspect and dry grain before storage. Seek laboratory advice if mold is suspected."),
 produceRisk("tomato-gray-mold","Gray mold","Botrytis cinerea",["Tomato"],"disease",["Gray fuzzy growth on rotting fruit"],"Damp storage can favor visible growth on infected fruit.","https://ipm.ucanr.edu/agriculture/tomato/gray-mold/","https://ipm.ucanr.edu/legacy_assets/PDF/PMG/pmgtomato.pdf","Handle fruit gently and separate rotting fruit."),
 produceRisk("onion-neck-rot","Neck rot","Botrytis spp.",["Onion"],"disease",["Soft brown neck and gray mold"],"Damp conditions can favor gray mold growth.","https://ipm.ucanr.edu/agriculture/onion-and-garlic/botrytis-neck-and-bulb-rot/","https://ipm.ucanr.edu/PMG/Identification/OnionGarlic_pests_and_damage.html","Cure onions before storage and check the necks."),
 produceRisk("potato-soft-rot","Bacterial soft rot","Pectobacterium spp.",["Potato"],"disease",["Wet soft patches on tubers"],"Injury and excess moisture can favor rot.","https://cpg.potatoes.wsu.edu/targets/bacterial-soft-rot-and-lenticel-rot/","https://ipm.ucanr.edu/PMG/C607/m607tptuberdmg.html","Avoid bruising and keep wet or damaged tubers separate."),
];
