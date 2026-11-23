"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { displayLabel } from "@/i18n/display-labels";
import LocationFields from "../location-fields";
import { cropGrowthStages as growthStages } from "@/lib/crop-growth-stages";
import { analyzeSoil, type SoilHealthInput } from "@/lib/soil-health";
import { calculateCustomFertilizer, calculateIcarFertilizer, getIcarRecipes, type IcarRecipe } from "@/lib/icar-fertilizer";
import { isExecutableScientificDose, requiresProductionConfirmation } from "@/lib/scientific-dose-registry";
import { availableSoilStandards } from "@/lib/soil-reference-matching";
import { soilLabMethodLabel } from "@/lib/soil-reference-matching";
import { farmerFertilizerLabel } from "@/i18n/farmer-fertilizer";
import { soilText } from "@/i18n/soil-health";
import { fieldHectares, estimateCost } from "@/lib/smart-fertilizer";
import { farmerSoilPayload, fertilizerAreaHa, type FarmerSoilForm } from "@/lib/farmer-fertilizer-form";
import type { SoilExtractionDraft } from "@/lib/soil-report-extraction";
import { soilScreeningCopy as copy } from "@/i18n/soil-screening-copy";

type Report = ReturnType<typeof analyzeSoil>;
type FormValues = FarmerSoilForm;
export type SavedCheck = { id: string; createdAt: string; input: SoilHealthInput; result: Report };
export type CropCycleChoice = { id: string; crop: string; variety: string | null; season: string; stage: string; sowingDate: string; field: string; fieldId: string; farm: string; farmId: string; cropId: string; state: string; district: string; soilType: string; area: number; areaUnit: "acre" | "hectare" };
type ApplicationRow = { id: string; crop: string; field: string; product: string; quantityKg: number; status: string; scheduledDate: string; appliedDate: string | null; method: string | null; cost: number | null };

const soilTypes = ["Alluvial", "Black", "Red", "Laterite", "Sandy", "Clay", "Loamy", "Other"];
const commonCrops = ["Wheat", "Rice (Paddy)", "Maize", "Millet", "Pearl millet", "Finger millet", "Sorghum", "Barley", "Mustard", "Chickpea (Gram)", "Pigeon pea", "Lentil", "Green gram", "Black gram", "Soybean", "Groundnut", "Sesame", "Sunflower", "Cotton", "Sugarcane", "Jute", "Potato", "Onion", "Tomato", "Chilli", "Turmeric", "Ginger", "Banana", "Mango"];
const emptyValues: FormValues = { state: "", district: "", crop: "", growthStage: "", soilType: "", nitrogenValue: "", phosphorusValue: "", potassiumValue: "", soilPh: "", season: undefined, nitrogenUnit: "UNKNOWN", phosphorusUnit: "UNKNOWN", potassiumUnit: "UNKNOWN", phosphorusBasis: "UNKNOWN", potassiumBasis: "UNKNOWN", nitrogenMethod: "", phosphorusMethod: "", potassiumMethod: "", phMethod: "UNKNOWN", referenceStandardId: "UNKNOWN", laboratoryName: "", labReferenceConfirmed: false };
const emptyManualRates = { n: "", p2o5: "", k2o: "", basalN: "", basalP: "", basalK: "", topdressLabel: "" };

export default function SoilHealthForm({ cropNames, cycles, applications, initialHistory, initialCycleId = "" }: { cropNames: string[]; cycles: CropCycleChoice[]; applications: ApplicationRow[]; initialHistory: SavedCheck[]; initialCycleId?: string }) {
  const locale = useLocale();
  const t = useTranslations("Fertilizer");
  const say = (en: string, hi: string) => locale === "hi" ? hi : farmerFertilizerLabel(locale, en) ?? soilText(locale, en);
  const initialCycle = cycles.find(cycle => cycle.id === initialCycleId) ?? (cycles.length === 1 ? cycles[0] : undefined);
  const [values, setValues] = useState<FormValues>(() => initialCycle ? { ...emptyValues, crop: initialCycle.crop, state: initialCycle.state, district: initialCycle.district, season: initialCycle.season as SoilHealthInput["season"], growthStage: initialCycle.stage, soilType: initialCycle.soilType, cropCycleId: initialCycle.id, cropId: initialCycle.cropId, fieldId: initialCycle.fieldId, farmId: initialCycle.farmId } : emptyValues);
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [area, setArea] = useState(initialCycle ? String(initialCycle.area) : "");
  const [areaUnit, setAreaUnit] = useState<"acre" | "hectare">(initialCycle?.areaUnit ?? "hectare");
  const [hasReport, setHasReport] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanEvidence, setScanEvidence] = useState("");
  const [scanReviewed, setScanReviewed] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [showMetadata, setShowMetadata] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const resultRef = useRef<HTMLElement>(null);
  const areaHa = fertilizerAreaHa(area, areaUnit);
  const [recipeId, setRecipeId] = useState("");
  const [customCrop, setCustomCrop] = useState(false);
  const [manualRates, setManualRates] = useState(emptyManualRates);
  const [doseCalculated, setDoseCalculated] = useState(false);
  const [cycleId, setCycleId] = useState(initialCycle?.id ?? "");
  const [productionConfirmed, setProductionConfirmed] = useState(false);
  function clearResult() {
    setSubmitted(false); setReport(null); setDoseCalculated(false); setError("");
  }
  const set = (key: keyof FormValues, value: string) => {
    clearResult();
    setValues(current => ({ ...current, [key]: value }));
  };
  function selectCycle(id: string) {
    const cycle = cycles.find(item => item.id === id);
    clearResult(); setCycleId(id); setRecipeId(""); setProductionConfirmed(false);
    setPrices({}); setManualRates(emptyManualRates); setScanEvidence(""); setScanMessage(""); setScanReviewed(false); setShowMetadata(false); setCustomCrop(false);
    setArea(cycle ? String(cycle.area) : ""); setAreaUnit(cycle?.areaUnit ?? "hectare");
    setValues(cycle ? { ...emptyValues, crop: cycle.crop, state: cycle.state, district: cycle.district,
      season: cycle.season as SoilHealthInput["season"], growthStage: cycle.stage, soilType: cycle.soilType,
      cropCycleId: cycle.id, cropId: cycle.cropId, fieldId: cycle.fieldId, farmId: cycle.farmId } : emptyValues);
  }
  const selectedCycle = cycles.find(cycle => cycle.id === cycleId);
  const recipes = getIcarRecipes(values.crop, values.state, values.district, { season: values.season, irrigationCondition: values.waterRegime, sowingCondition: values.sowingCondition, includeConfirmationOptions: true })
    .filter(recipe => recipe.scientificRecord && isExecutableScientificDose(recipe.scientificRecord));
  const selectedRecipe = recipes.find(recipe => recipe.id === recipeId) ?? (recipes.length === 1 ? recipes[0] : undefined);
  const scientific = selectedRecipe?.scientificRecord;
  const confirmationRequired = !!scientific && (requiresProductionConfirmation(scientific) ||
    !!scientific.irrigationCondition || !!scientific.sowingCondition);
  const fertilizerPlan = selectedRecipe && areaHa !== null && (!confirmationRequired || productionConfirmed) ? calculateIcarFertilizer(selectedRecipe as IcarRecipe, Number(areaHa)) : null;
  const manualNumbers = [manualRates.n, manualRates.p2o5, manualRates.k2o, manualRates.basalN, manualRates.basalP, manualRates.basalK].map(Number);
  const manualInputsValid = manualRates.n !== "" && manualRates.p2o5 !== "" && manualRates.k2o !== "" && manualRates.basalN !== "" && manualRates.basalP !== "" && manualRates.basalK !== "" && manualRates.topdressLabel.trim() !== "" && manualNumbers.every(Number.isFinite) && manualNumbers.slice(0, 3).every(value => value >= 0 && value <= 100000) && manualNumbers[3] >= 0 && manualNumbers[3] <= 100 && manualNumbers[4] >= 0 && manualNumbers[4] <= 100 && manualNumbers[5] >= 0 && manualNumbers[5] <= 100 && areaHa !== null;
  const manualPlan = manualInputsValid ? calculateCustomFertilizer({ nitrogenKgHa: manualNumbers[0], phosphorusP2O5KgHa: manualNumbers[1], potassiumK2OKgHa: manualNumbers[2], basalNitrogenPercent: manualNumbers[3], basalPhosphorusPercent: manualNumbers[4], basalPotassiumPercent: manualNumbers[5], areaHa: Number(areaHa), topdressLabel: manualRates.topdressLabel }) : null;
  const setManual = (key: keyof typeof emptyManualRates, value: string) => { setDoseCalculated(false); setManualRates(current => ({ ...current, [key]: value })); };
  const savedReport = selectedCycle && history.find(item => item.input?.mode !== "DEMO" && !item.input?.synthetic &&
    item.input?.fieldId === selectedCycle.fieldId);
  function fillSavedReport(input: SoilHealthInput) {
    clearResult(); setScanEvidence(""); setScanMessage(""); setScanReviewed(false);
    const unit = (specific: SoilHealthInput["nitrogenUnit"]) => specific && specific !== "UNKNOWN" ? specific : input.nutrientUnit ?? "UNKNOWN";
    setValues(current => ({ ...current,
      nitrogenValue: String(input.nitrogenValue ?? input.nitrogenKgHa ?? ""),
      phosphorusValue: String(input.phosphorusValue ?? input.phosphorusKgHa ?? ""),
      potassiumValue: String(input.potassiumValue ?? input.potassiumKgHa ?? ""),
      soilPh: String(input.soilPh ?? ""),
      nitrogenUnit: unit(input.nitrogenUnit), phosphorusUnit: unit(input.phosphorusUnit), potassiumUnit: unit(input.potassiumUnit),
      nitrogenMethod: input.nitrogenMethod ?? "", phosphorusMethod: input.phosphorusMethod ?? "", potassiumMethod: input.potassiumMethod ?? "",
      phosphorusBasis: input.phosphorusBasis ?? "UNKNOWN", potassiumBasis: input.potassiumBasis ?? "UNKNOWN", phMethod: input.phMethod ?? "UNKNOWN",
      referenceStandardId: input.referenceStandardId ?? "UNKNOWN", laboratoryName: input.laboratoryName ?? "", reportNumber: input.reportNumber ?? "",
      sampleDate: input.sampleDate, reportDate: input.reportDate, labReferenceConfirmed: input.labReferenceConfirmed ?? false,
    }));
  }
  const cropOptions = [...new Set([...commonCrops, ...cropNames, "Arhar", "Paddy", "Corn", "Tur"])].sort((a, b) => a.localeCompare(b));

  async function scanReport(file: File) {
    clearResult(); setScanBusy(true); setScanMessage(""); setScanReviewed(false);
    try {
      const body = new FormData();
      body.set("report", file); body.set("locale", locale);
      const response = await fetch("/api/soil-health/scan", { method: "POST", body });
      const scan = await response.json() as { draft?: SoilExtractionDraft; evidence?: string; partial?: boolean; error?: string };
      if (!response.ok) throw new Error(scan.error);
      setScanEvidence(scan.evidence ?? "");
      setShowMetadata(true);
      const draft = scan.draft;
      if (draft) setValues(current => ({
        ...current, nitrogenValue: draft.nitrogenKgHa?.toString() ?? "", phosphorusValue: draft.phosphorusKgHa?.toString() ?? "",
        potassiumValue: draft.potassiumKgHa?.toString() ?? "", soilPh: draft.soilPh?.toString() ?? "",
        nitrogenUnit: draft.nutrientUnit ?? "UNKNOWN", phosphorusUnit: draft.nutrientUnit ?? "UNKNOWN", potassiumUnit: draft.nutrientUnit ?? "UNKNOWN",
        nitrogenMethod: draft.nitrogenMethod ?? "", phosphorusMethod: draft.phosphorusMethod ?? "", potassiumMethod: draft.potassiumMethod ?? "",
        phosphorusBasis: draft.phosphorusBasis ?? "UNKNOWN", potassiumBasis: draft.potassiumBasis ?? "UNKNOWN", phMethod: draft.phMethod ?? "UNKNOWN",
        laboratoryName: draft.laboratoryName ?? "", reportNumber: draft.reportNumber ?? "", sampleDate: draft.sampleDate, reportDate: draft.reportDate,
        labReferenceConfirmed: false,
      }));
      setScanMessage(draft && !scan.partial
        ? say("Check the extracted values, units and test methods against your report.", "निकाले गए मान, इकाइयाँ और जाँच के तरीके रिपोर्ट से मिलाएँ।")
        : say("Only part of the report could be read. Enter or correct the missing details below.", "रिपोर्ट का कुछ हिस्सा ही पढ़ा गया। नीचे जानकारी भरें या सुधारें।"));
    } catch (cause) {
      setScanMessage(locale === "hi" ? "रिपोर्ट पढ़ी नहीं जा सकी। रिपोर्ट देखकर मान भरें।" : cause instanceof Error ? cause.message : "Enter the report values manually.");
    } finally { setScanBusy(false); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || scanBusy || areaHa === null) return;
    setError(""); setReport(null);
    if (!hasReport) {
      setSubmitted(true);
      requestAnimationFrame(() => resultRef.current?.focus());
      return;
    }
    if (scanEvidence && !scanReviewed) return;
    if (![values.nitrogenValue, values.phosphorusValue, values.potassiumValue, values.soilPh].some(value => value.trim())) {
      setError(say("Enter at least one value from the report.", "रिपोर्ट से कम से कम एक मान भरें।")); return;
    }
    if (!values.growthStage) {
      setError(say("Choose the crop growth stage.", "फसल की अवस्था चुनें।")); return;
    }
    setBusy(true);
    const payload = farmerSoilPayload(values, areaHa);
    try {
      const response = await fetch("/api/soil-health", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Soil check could not be completed.");
      setReport(data.result as Report); setSubmitted(true);
      setHistory(current => [{ id: data.id, createdAt: data.createdAt, input: payload, result: data.result as Report }, ...current].slice(0, 8));
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Soil check could not be completed.");
    } finally { setBusy(false); }
  }

  async function deleteSavedCheck(id: string) {
    if (!window.confirm("Delete this saved recommendation?")) return;
    setDeletingId(id); setError("");
    try {
      const response = await fetch("/api/soil-health", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete the saved recommendation.");
      setHistory(current => current.filter(item => item.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the saved recommendation.");
    } finally { setDeletingId(""); }
  }


  const soilFields = [
    ["nitrogenValue", "N", "नाइट्रोजन (N)"],
    ["phosphorusValue", "P", "फास्फोरस (P)"],
    ["potassiumValue", "K", "पोटाश (K)"],
    ["soilPh", "pH", "मिट्टी का pH"],
  ] as const;
  const stageNames = ["बुवाई और अंकुर", "पौधा बढ़ रहा है", "फूल आ रहे हैं", "फल या दाने बन रहे हैं", "फसल पक रही है"];
  const unitName = areaUnit === "acre" ? say("acre", "एकड़") : say("hectare", "हेक्टेयर");
  const regionalSource = selectedRecipe && (!confirmationRequired || productionConfirmed) ? selectedRecipe.source : null;
  const products = fertilizerPlan ? [
    { name: "Urea", label: say("Urea", "यूरिया"), perHa: fertilizerPlan.perHa.urea, total: fertilizerPlan.total.urea },
    { name: "DAP", label: "DAP", perHa: fertilizerPlan.perHa.dap, total: fertilizerPlan.total.dap },
    { name: "SSP", label: "SSP", perHa: fertilizerPlan.perHa.ssp ?? 0, total: fertilizerPlan.total.ssp ?? 0 },
    { name: "MOP", label: "MOP", perHa: fertilizerPlan.perHa.mop, total: fertilizerPlan.total.mop },
  ].filter(product => product.total > 0) : [];
  const displayQuantity = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 2 });
  const canShowDose = Boolean(hasReport && report && submitted && fertilizerPlan && areaHa !== null);
  const hasPrices = canShowDose && products.length > 0 && products.every(item => prices[item.name]?.trim() &&
    Number.isFinite(Number(prices[item.name])) && Number(prices[item.name]) > 0 && Number(prices[item.name]) <= 100_000);
  const cost = hasPrices && areaHa ? products.reduce((sum, product) => sum + estimateCost(product.total, Number(prices[product.name]), 1, areaHa).total, 0) : null;

  return <div className="soil-health-layout farmer-fertilizer">
    <form className="panel soil-health-form" onSubmit={submit}>
      <fieldset disabled={busy || scanBusy} className="farmer-fertilizer-fields">
        <div className="soil-health-grid">
          <label className="field"><span>{say("Saved crop", "दर्ज फसल")}</span>
            <select value={cycleId} onChange={event => selectCycle(event.target.value)}>
              <option value="">{say("Choose a saved crop", "दर्ज फसल चुनें")}</option>
              {cycles.map(cycle => <option key={cycle.id} value={cycle.id}>{displayLabel(cycle.crop, locale)} · {cycle.field}, {cycle.farm}</option>)}
            </select>
          </label>
          <div className="field">
            <label htmlFor="fertilizer-area">{say("Field area", "खेत का क्षेत्रफल")}</label>
            <div className="farmer-fertilizer-area">
              <input id="fertilizer-area" type="number" inputMode="decimal" min="0.0001" max="100000" step="any" value={area} onChange={event => { setArea(event.target.value); clearResult(); }} required />
              <select aria-label={say("Area unit", "क्षेत्रफल की इकाई")} value={areaUnit} onChange={event => {
                const next = event.target.value as typeof areaUnit;
                if (areaHa !== null) setArea(String(Number((areaHa / fieldHectares(1, next)).toFixed(8))));
                setAreaUnit(next); clearResult();
              }}><option value="acre">{say("Acres", "एकड़")}</option><option value="hectare">{say("Hectares", "हेक्टेयर")}</option></select>
            </div>
          </div>
          <label className="field"><span>{t("growthStage")}</span>
            <select value={values.growthStage} onChange={event => set("growthStage", event.target.value)} required={hasReport}>
              <option value="">{t("select")}</option>{growthStages.map((stage, index) => <option key={stage} value={stage}>{say(soilText(locale, stage), stageNames[index])}</option>)}
            </select>
          </label>
          <label className="field"><span>{t("soilType")}</span>
            <select value={values.soilType} onChange={event => set("soilType", event.target.value)}>
              <option value="">{say("I don’t know", "मुझे नहीं पता")}</option>
              {[...new Set([...soilTypes, ...(values.soilType ? [values.soilType] : [])])].map(soil => <option key={soil} value={soil}>{displayLabel(soil, locale)}</option>)}
            </select>
          </label>
        </div>
        <div className="field" role="group" aria-label={say("Soil test available?", "क्या मिट्टी की जाँच रिपोर्ट है?")}>
          <strong>{say("Soil test available?", "क्या मिट्टी की जाँच रिपोर्ट है?")}</strong>
          <div className="farmer-fertilizer-options">
            {[false, true].map(choice => <label key={String(choice)}>
              <input name="has-soil-report" type="radio" checked={hasReport === choice} onChange={() => { setHasReport(choice); clearResult(); }} />
              {choice ? say("Yes", "हाँ") : say("No", "नहीं")}
            </label>)}
          </div>
        </div>
        {!selectedCycle && <details className="farmer-fertilizer-details" open={cycles.length === 0 || undefined}>
          <summary>{say("Enter crop and location manually", "फसल और जगह खुद भरें")}</summary>
          <div className="soil-health-grid">
            <label className="field"><span>{t("crop")}</span><select value={customCrop ? "__other__" : values.crop} onChange={event => {
              setCustomCrop(event.target.value === "__other__"); set("crop", event.target.value === "__other__" ? "" : event.target.value); setRecipeId(""); setProductionConfirmed(false);
            }}><option value="">{t("select")}</option>{cropOptions.map(name => <option key={name} value={name}>{displayLabel(name, locale)}</option>)}<option value="__other__">{say("Other crop", "अन्य फसल")}</option></select>
              {customCrop && <input aria-label={t("crop")} value={values.crop} onChange={event => set("crop", event.target.value)} />}</label>
            <label className="field"><span>{t("season")}</span><select value={values.season ?? ""} onChange={event => {
              clearResult(); setRecipeId(""); setProductionConfirmed(false);
              setValues(current => ({ ...current, season: (event.target.value || undefined) as SoilHealthInput["season"] }));
            }}><option value="">{t("select")}</option>{["KHARIF", "RABI", "ZAID"].map(season => <option key={season} value={season}>{displayLabel(season, locale)}</option>)}</select></label>
          </div>
          <LocationFields idPrefix="soil-health" stateValue={values.state} districtValue={values.district} stateLabel={t("state")} districtLabel={t("district")} onLocationChange={(state, district) => {
            clearResult(); setRecipeId(""); setProductionConfirmed(false);
            setValues(current => ({ ...current, state, district, referenceStandardId: "UNKNOWN", labReferenceConfirmed: false }));
          }}/>
        </details>}
        {hasReport && <section className="farmer-fertilizer-details">
          <h2>{say("Your soil test report", "आपकी मिट्टी की जाँच रिपोर्ट")}</h2>
          {savedReport && <button type="button" className="subtle-link" onClick={() => fillSavedReport(savedReport.input)}>
            {say("Use last saved soil report for this field", "इस खेत की पिछली दर्ज मिट्टी रिपोर्ट इस्तेमाल करें")}
          </button>}
          <label className="field"><span>{say("Scan a PDF or photo (optional)", "रिपोर्ट की PDF या फोटो स्कैन करें (वैकल्पिक)")}</span>
            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => { const file = event.target.files?.[0]; if (file) void scanReport(file); event.target.value = ""; }} />
          </label>
          {scanBusy && <p role="status">{say("Reading report…", "रिपोर्ट पढ़ रहे हैं…")}</p>}
          {scanMessage && <p role="status">{scanMessage}</p>}
          <div className="soil-health-grid">
            {soilFields.map(([key, en, hi]) => <label className="field" key={key}><span>{say(en, hi)}</span>
              <input type="number" inputMode="decimal" min="0" max={key === "soilPh" ? 14 : 100000} step="any" value={values[key]} onChange={event => set(key, event.target.value)} placeholder={key === "soilPh" ? "e.g. 7.2" : say("As printed on the report", "जैसा रिपोर्ट में लिखा है")} />
            </label>)}
          </div>
          <details open={showMetadata} onToggle={event => setShowMetadata(event.currentTarget.open)} className="farmer-fertilizer-details">
            <summary>{say("Advanced Soil Report Details", "मिट्टी की रिपोर्ट की विस्तृत जानकारी")}</summary>
            <p>{say("Copy units, test methods and P/K reporting basis exactly as printed. Leave missing details unknown.", "इकाई, जाँच का तरीका और P/K का रूप रिपोर्ट से ज्यों का त्यों भरें। जो जानकारी नहीं है उसे खाली छोड़ें।")}</p>
            <div className="soil-health-grid">
              <SoilValueField title="Available N" unit={values.nitrogenUnit ?? "UNKNOWN"} method={values.nitrogenMethod ?? ""} onUnit={value => set("nitrogenUnit", value)} onMethod={value => set("nitrogenMethod", value)} methods={[["ALKALINE_KMNO4_N", "Alkaline KMnO₄"]]}/>
              <SoilValueField title="Available P" unit={values.phosphorusUnit ?? "UNKNOWN"} method={values.phosphorusMethod ?? ""} basis={values.phosphorusBasis ?? "UNKNOWN"} onUnit={value => set("phosphorusUnit", value)} onMethod={value => set("phosphorusMethod", value)} onBasis={value => set("phosphorusBasis", value)} methods={[["OLSEN_P", "Olsen P"]]}/>
              <SoilValueField title="Available K" unit={values.potassiumUnit ?? "UNKNOWN"} method={values.potassiumMethod ?? ""} basis={values.potassiumBasis ?? "UNKNOWN"} onUnit={value => set("potassiumUnit", value)} onMethod={value => set("potassiumMethod", value)} onBasis={value => set("potassiumBasis", value)} methods={[["NEUTRAL_1N_NH4OAC_K", "Neutral 1N ammonium acetate K"]]}/>
              <label className="field"><span>{say("pH test method", "pH जाँच का तरीका")}</span><select value={values.phMethod ?? "UNKNOWN"} onChange={event => set("phMethod", event.target.value)}><option value="UNKNOWN">Unknown</option><option value="WATER_1_2_5">Water 1:2.5</option><option value="OTHER">Other method</option></select></label>
              <label className="field"><span>{say("Soil screening reference", "मिट्टी की जाँच का संदर्भ")}</span><select value={values.referenceStandardId ?? "UNKNOWN"} onChange={event => set("referenceStandardId", event.target.value)}><option value="UNKNOWN">Unknown</option>{availableSoilStandards(values.state).map(reference => <option key={reference.id} value={reference.id}>{reference.name}</option>)}</select></label>
              <label className="field"><span>{copy(locale, "Issuing laboratory (optional)")}</span><input value={values.laboratoryName ?? ""} onChange={event => set("laboratoryName", event.target.value)} /></label>
              <label className="field"><span>{copy(locale, "Report number (optional)")}</span><input value={values.reportNumber ?? ""} onChange={event => set("reportNumber", event.target.value)} /></label>
              <label className="field"><span>{say("Sample date", "नमूने की तारीख")}</span><input type="date" value={values.sampleDate ?? ""} onChange={event => { clearResult(); setValues(current => ({ ...current, sampleDate: event.target.value || undefined })); }} /></label>
              <label className="field"><span>{say("Report date", "रिपोर्ट की तारीख")}</span><input type="date" value={values.reportDate ?? ""} onChange={event => { clearResult(); setValues(current => ({ ...current, reportDate: event.target.value || undefined })); }} /></label>
              <label><input type="checkbox" checked={values.labReferenceConfirmed ?? false} onChange={event => { clearResult(); setValues(current => ({ ...current, labReferenceConfirmed: event.target.checked })); }}/> {say("Laboratory confirmed the screening reference applies", "प्रयोगशाला ने इस जाँच संदर्भ की पुष्टि की है")}</label>
            </div>
            <p className="muted">{copy(locale, "Concentration values (mg/kg or ppm) are not converted to kg/ha without the required soil and reporting details.")}</p>
            {scanEvidence && <details><summary>{say("View extracted report text", "रिपोर्ट से निकाला गया पाठ देखें")}</summary><pre className="farmer-fertilizer-evidence">{scanEvidence}</pre></details>}
          </details>
          {scanEvidence && <label className="farmer-fertilizer-review">
            <input type="checkbox" checked={scanReviewed} onChange={event => setScanReviewed(event.target.checked)} />
            {say("I checked the values, units and methods against the original report.", "मैंने मान, इकाइयाँ और जाँच के तरीके मूल रिपोर्ट से मिला लिए हैं।")}
          </label>}
        </section>}
        <button className="btn" disabled={busy || scanBusy || areaHa === null || !values.crop || !values.state || !values.district || (hasReport && !!scanEvidence && !scanReviewed)}>
          {busy ? t("busy") : say("See fertilizer guidance", "खाद की सलाह देखें")}
        </button>
        {error && <p role="alert" className="error-message">{error}</p>}
      </fieldset>
    </form>

    {submitted && <section ref={resultRef} tabIndex={-1} className="panel farmer-fertilizer-results" aria-live="polite">
      <div className="soil-health-grid">
        <div><h2>{say("Your crop", "आपकी फसल")}</h2><p>{displayLabel(values.crop, locale)} · {displayLabel(values.season ?? "", locale)}{values.growthStage && ` · ${say(soilText(locale, values.growthStage), stageNames[growthStages.findIndex(stage => stage === values.growthStage)] ?? values.growthStage)}`}</p></div>
        <div><h2>{say("Your field", "आपके खेत की जानकारी")}</h2><p>{selectedCycle && `${selectedCycle.field}, `}{values.district}, {values.state} · {area} {unitName} · {values.soilType ? displayLabel(values.soilType, locale) : say("Soil type unknown", "मिट्टी का प्रकार पता नहीं")}</p></div>
      </div>
      <h2>{say("General fertilizer guidance", "खाद की सामान्य सलाह")}</h2>
      <p>{regionalSource
        ? say("A verified regional standard matches this crop and location. Use the source to check which conditions apply to your field.", "इस फसल और इलाके के लिए सत्यापित सिफारिश उपलब्ध है। अपने खेत पर लागू शर्तें स्रोत में देखें।")
        : say("Use a crop-specific Soil Health Card or a verified local advisory. A matching recommendation has not been confirmed here.", "फसल के लिए मृदा स्वास्थ्य कार्ड या सत्यापित स्थानीय सलाह देखें। यहाँ आपके खेत के लिए मेल खाती सिफारिश की पुष्टि नहीं हुई है।")}</p>
      <p>{hasReport
        ? say("Soil screening explains the laboratory results. The regional fertilizer rate is calculated separately.", "मिट्टी की जाँच से रिपोर्ट के मान समझें। क्षेत्र की खाद की मात्रा अलग से तय होती है।")
        : say("A compatible soil test and a validated field-specific method are needed to calculate a personalized dose.", "खेत के हिसाब से खाद की मात्रा निकालने के लिए उपयुक्त मिट्टी की जाँच और सत्यापित तरीका चाहिए।")}</p>
      {recipes.length > 0 && (recipes.length > 1 || confirmationRequired) && <details className="farmer-fertilizer-details">
        <summary>{say("Check regional recommendation conditions", "क्षेत्र की सिफारिश की शर्तें देखें")}</summary>
        {recipes.length > 1 && <label className="field"><span>{say("Regional recommendation", "क्षेत्र की सिफारिश")}</span><select value={recipeId} onChange={event => { setRecipeId(event.target.value); setProductionConfirmed(false); }}>
          <option value="">{t("select")}</option>{recipes.map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.variant}</option>)}
        </select></label>}
        {selectedRecipe && <>
          <p>{[selectedRecipe.scientificRecord?.productionType, selectedRecipe.scientificRecord?.irrigationCondition, selectedRecipe.scientificRecord?.sowingCondition]
            .filter((item, index, all): item is string => !!item && all.indexOf(item) === index).map(item => displayLabel(item, locale)).join(" · ")}</p>
          <a href={selectedRecipe.source.url} target="_blank" rel="noreferrer">{selectedRecipe.source.title}</a>
          {confirmationRequired && <label className="farmer-fertilizer-review"><input type="checkbox" checked={productionConfirmed} onChange={event => setProductionConfirmed(event.target.checked)} />{say("I checked the publication and confirmed its crop, season, irrigation and sowing conditions apply to this field.", "मैंने स्रोत देखकर पुष्टि की है कि फसल, मौसम, सिंचाई और बुवाई की शर्तें इस खेत पर लागू हैं।")}</label>}
        </>}
      </details>}
      {canShowDose && fertilizerPlan && selectedRecipe && <>
        <h2>{say("Fertilizer quantity", "खाद की मात्रा")}</h2>
        <p>{say("General regional rate, calculated with standard fertilizer grades.", "क्षेत्र की सामान्य दर। गणना खाद की मानक ग्रेड से की गई है।")}</p>
        <ul>{products.map(product => <li key={product.name}><strong>{product.label}</strong> · {displayQuantity(product.perHa * fieldHectares(1, areaUnit))} {say("kg per", "किलो प्रति")} {unitName} · {displayQuantity(product.total)} {say("kg for your field", "किलो पूरे खेत के लिए")}</li>)}</ul>
        {selectedRecipe.schedule.length > 0 && <><h2>{say("When to apply", "खाद कब दें")}</h2><ul>{fertilizerPlan.schedule.map((item, index) => <li key={index}>{soilText(locale, item.label)} · {products.map(product => {
          const kg = item[product.name.toLowerCase() as "urea" | "dap" | "ssp" | "mop"] ?? 0;
          return kg > 0 ? `${product.label} ${displayQuantity(kg)} ${say("kg", "किलो")}` : null;
        }).filter(Boolean).join(" · ")}</li>)}</ul></>}
        <details className="farmer-fertilizer-details"><summary>{say("Enter local fertilizer prices (optional)", "खाद के स्थानीय दाम भरें (वैकल्पिक)")}</summary>
          <div className="soil-health-grid">{products.map(product => <label className="field" key={product.name}><span>{product.label} · {say("₹ per kg", "₹ प्रति किलो")}</span><input type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" value={prices[product.name] ?? ""} onChange={event => setPrices(current => ({ ...current, [product.name]: event.target.value }))}/></label>)}</div>
        </details>
        {cost !== null && <><h2>{say("Estimated cost", "अनुमानित लागत")}</h2><p>₹{displayQuantity(cost)}</p></>}
      </>}
      <h2>{say("Important precautions", "जरूरी सावधानियाँ")}</h2>
      <p>{say("Check the grade on each fertilizer bag. Take unclear readings or reporting units to the testing laboratory before using them.", "हर खाद की बोरी पर ग्रेड देखें। रिपोर्ट का मान या इकाई साफ न हो तो प्रयोगशाला से पूछें।")}</p>
      <h2>{say("Source", "जानकारी का स्रोत")}</h2>
      <a href={regionalSource?.url ?? "https://soilhealth.dac.gov.in/files/Manual/140723DraftTeacherManual_PDF.pdf"} target="_blank" rel="noreferrer">{regionalSource?.title ?? say("Government of India Soil Health Card manual", "भारत सरकार का मृदा स्वास्थ्य कार्ड निर्देश")}</a>
    </section>}
    {report && <details className="panel farmer-fertilizer-advanced"><summary>{say("Soil screening result", "मिट्टी की जाँच का नतीजा")}</summary><SoilReport report={report} locale={locale} /></details>}
    <details className="panel farmer-fertilizer-advanced">
      <summary>{say("Advanced calculator for an issued fertilizer recommendation", "जारी खाद सिफारिश की मात्रा निकालें")}</summary>
      <p>{t("quantityOnly")} {say("Enter rates and splits from your applicable published or issued recommendation.", "अपने खेत पर लागू जारी सिफारिश में लिखी दर और किस्त भरें।")}</p>
        <div className="soil-health-grid">
          <label className="field"><span>{t("recommendedN")}</span><input type="number" min="0" step="0.01" value={manualRates.n} onChange={event => setManual("n", event.target.value)} placeholder={t("kgHa")}/><small className="muted">{t("cropRateN")}</small></label>
          <label className="field"><span>{t("recommendedP2O5")}</span><input type="number" min="0" step="0.01" value={manualRates.p2o5} onChange={event => setManual("p2o5", event.target.value)} placeholder={t("kgHa")}/><small className="muted">{t("enterP2O5")}</small></label>
          <label className="field"><span>{t("recommendedK2O")}</span><input type="number" min="0" step="0.01" value={manualRates.k2o} onChange={event => setManual("k2o", event.target.value)} placeholder={t("kgHa")}/><small className="muted">{t("enterK2O")}</small></label>
          <label className="field"><span>{t("basalN")}</span><input type="number" min="0" max="100" step="1" value={manualRates.basalN} onChange={event => setManual("basalN", event.target.value)} placeholder={t("example50")}/></label>
          <label className="field"><span>{t("basalP2O5")}</span><input type="number" min="0" max="100" step="1" value={manualRates.basalP} onChange={event => setManual("basalP", event.target.value)} placeholder={t("example100")}/></label>
          <label className="field"><span>{t("basalK2O")}</span><input type="number" min="0" max="100" step="1" value={manualRates.basalK} onChange={event => setManual("basalK", event.target.value)} placeholder={t("example100")}/></label>
          <label className="field"><span>{t("remainingTiming")}</span><input value={manualRates.topdressLabel} onChange={event => setManual("topdressLabel", event.target.value)} placeholder={t("firstIrrigation")}/><small className="muted">{t("remainingShareScheduled")}</small></label>
        </div>
        {!doseCalculated && <p className="muted">{t("enterRatesCalculate")}</p>}
        {doseCalculated && manualInputsValid && !manualPlan && <p role="alert" className="error-message">DAP alone supplies more nitrogen than the entered total N target. Confirm the SHC values or use a crop recommendation with another phosphorus fertilizer.</p>}
        {doseCalculated && manualPlan && <>
          <h3>Offline calculation for {values.crop} · {values.district}, {values.state}</h3>
          <p>For {area} {unitName}: <strong>Urea {manualPlan.total.urea.toFixed(1)} kg · DAP {manualPlan.total.dap.toFixed(1)} kg · MOP {manualPlan.total.mop.toFixed(1)} kg</strong></p>
          <div className="table-wrap"><table className="table"><thead><tr><th>Application time</th><th>Urea (kg)</th><th>DAP (kg)</th><th>MOP (kg)</th></tr></thead><tbody>{manualPlan.schedule.map(split => <tr key={split.label}><td>{split.label}</td><td>{split.urea.toFixed(1)}</td><td>{split.dap.toFixed(1)}</td><td>{split.mop.toFixed(1)}</td></tr>)}</tbody></table></div>
          <p className="muted">Custom offline calculation from the rates and split you entered. Check the fertilizer grades on product bags; this result is not an ICAR-generated dose.</p>
        </>}
      <button type="button" className="btn" disabled={!manualInputsValid} onClick={() => setDoseCalculated(true)}>{t("calculateQuantities")}</button>
    </details>

    <details className="panel soil-health-reference farmer-fertilizer-advanced">
      <summary>{say("How the soil check works", "मिट्टी की जाँच कैसे समझें")}</summary>
      <p>It classifies the N, P and K test results using the general nutrient bands in the Government of India Soil Health Card Portal Teacher&apos;s Manual. The report uses crop and growth stage to frame what to check on your own crop-specific card. It does not calculate a fertilizer product or application dose.</p>
      <a href="https://soilhealth.dac.gov.in/files/Manual/140723DraftTeacherManual_PDF.pdf" target="_blank" rel="noreferrer">Source: Soil Health Card Portal Teacher&apos;s Manual for Soil</a>
    </details>

    <section className="panel soil-health-history">
      <h2 style={{ marginTop: 0 }}>{t("history")}</h2>
      {history.length === 0 ? <p className="muted">No saved soil checks yet. Submit the form to store a local copy in your account.</p> : <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Location</th><th>Crop · stage</th><th>N / P / K</th><th>pH</th><th>N / P / K rating</th><th>Action</th></tr></thead><tbody>{history.map(item => {
        const input = item.input ?? {};
        const nutrients = Array.isArray(item.result?.nutrients) ? item.result.nutrients : [];
        const ratings = nutrients.map(nutrient => nutrient?.rating).filter(Boolean).join(" / ") || "Older result format";
        return <tr key={item.id}><td>{item.createdAt && !Number.isNaN(Date.parse(item.createdAt)) ? new Date(item.createdAt).toLocaleDateString("en-IN") : "—"}</td><td>{input.district || "—"}{input.state ? `, ${input.state}` : ""}</td><td>{input.crop || "—"}{input.growthStage ? ` · ${input.growthStage}` : ""}</td><td>{[
          [input.nitrogenValue ?? input.nitrogenKgHa, input.nitrogenUnit],
          [input.phosphorusValue ?? input.phosphorusKgHa, input.phosphorusUnit],
          [input.potassiumValue ?? input.potassiumKgHa, input.potassiumUnit],
        ].map(([value, unit]) => value == null ? "—" : `${value} ${unit && unit !== "UNKNOWN" ? unit : input.nutrientUnit && input.nutrientUnit !== "UNKNOWN" ? input.nutrientUnit : say("(unit unknown)", "(इकाई अज्ञात)")}`).join(" / ")}</td><td>{input.soilPh ?? "—"}</td><td>{ratings}</td><td><button type="button" className="subtle-link danger-link" disabled={deletingId === item.id} onClick={() => void deleteSavedCheck(item.id)}>{deletingId === item.id ? "Deleting…" : "Delete"}</button></td></tr>;
      })}</tbody></table></div>}
    </section>
    <section className="panel soil-health-history">
      <h2 style={{ marginTop: 0 }}>Fertilizer application history</h2>
      {applications.length === 0 ? <p className="muted">No fertilizer applications have been recorded for your crop cycles.</p> : <div className="table-wrap"><table className="table"><thead><tr><th>Crop · field</th><th>Product</th><th>Quantity</th><th>Status</th><th>Planned / applied date</th><th>Method</th><th>Cost</th></tr></thead><tbody>{applications.map(item => <tr key={item.id}><td>{item.crop} · {item.field}</td><td>{item.product}</td><td>{item.quantityKg.toLocaleString(locale)} kg</td><td>{item.status}</td><td>{item.appliedDate ?? item.scheduledDate}</td><td>{item.method ?? "—"}</td><td>{item.cost === null ? "—" : `₹${item.cost.toLocaleString(locale)}`}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}

function SoilReport({ report, locale }: { report: Report; locale: string }) {
  const tr = (value: string) => soilText(locale, value);
  const phBand = report.ph.reference?.bands.find(band => report.ph.value !== null && report.ph.value !== undefined && report.ph.value >= band.min && report.ph.value <= band.max);
  const missingLabel = (value: string) => {
    const match = /^(.*): (unit|method|reporting basis)$/.exec(value);
    if (!match) return tr(value);
    const field = match[2] === "unit" ? copy(locale, "Unit not recorded") : match[2] === "method" ? copy(locale, "Method not recorded") : copy(locale, "Reporting basis not recorded");
    return `${tr(match[1])}: ${field}`;
  };
  return <section className="panel soil-health-report" aria-live="polite">
    <p className="crop-advice-kicker">{copy(locale, "OFFLINE SOIL HEALTH SCREENING")}</p>
    <h2>{report.location} · {report.crop}</h2>
    <p className="muted">{tr(report.growthStage)} · {tr(report.soilType)} soil</p>
    <h3>{copy(locale, "Soil health screening")}</h3>
    <div className="table-wrap"><table className="table"><thead><tr><th>{tr("Parameter")}</th><th>{copy(locale, "Test value")}</th><th>{copy(locale, "Screening class")}</th><th>{copy(locale, "What it means")}</th></tr></thead><tbody>
      {report.nutrients.map(item => <tr key={item.name}><td>{tr(item.name)}<small className="muted" style={{ display: "block" }}>{tr("Method:")} {tr(soilLabMethodLabel(item.method))} · {tr("basis:")} {tr(item.basis)}</small>{item.reference && <small className="muted" style={{ display: "block" }}>{copy(locale, "Threshold source")}: {item.reference.source} · {item.reference.sourceSection}</small>}</td><td>{item.value ?? "—"} {item.unit === "UNKNOWN" ? copy(locale, "Unit not recorded") : tr(item.unit)}</td><td><strong>{tr(item.rating)}</strong><small className="muted" style={{ display: "block" }}>{tr("Band:")} {tr(item.range)}</small></td><td>{item.rating === "Unknown" ? <>{copy(locale, "Unknown is shown when a required value or compatible method, unit, basis or reference is missing.")} {tr(item.guidance)}</> : copy(locale, "This is a soil screening class, not a fertilizer dose.")}</td></tr>)}
      {report.ph && <tr><td>{tr("Soil pH")}<small className="muted" style={{ display: "block" }}>{tr("Method:")} {tr(report.ph.method)} · {copy(locale, "Laboratory identity")}: {report.ph.laboratoryVerified ? copy(locale, "provided") : copy(locale, "missing")}</small>{report.ph.reference && <small className="muted" style={{ display: "block" }}>{copy(locale, "Threshold source")}: {report.ph.reference.source} · {report.ph.reference.region}</small>}</td><td>{report.ph.value ?? "—"} pH</td><td><strong>{tr(report.ph.rating)}</strong><small className="muted" style={{ display: "block" }}>{phBand ? `${tr("Band:")} ${phBand.min}–${phBand.max} pH` : tr("Not applicable")}</small></td><td>{report.ph.rating === "Unknown" ? tr(report.ph.guidance) : copy(locale, "This is a soil screening class, not a fertilizer dose.")}</td></tr>}
    </tbody></table></div>
    <p><strong>{copy(locale, "Soil reference")}:</strong> {tr(report.soilTestMetadata.referenceName ?? "No compatible regional reference selected")} · {copy(locale, "Laboratory identity")}: {copy(locale, report.soilTestMetadata.labIdentity)} · {copy(locale, "Reference applicability")}: {copy(locale, report.soilTestMetadata.labApplicability)}. {report.soilTestMetadata.referenceSource && <>{copy(locale, "Source name")}: {report.soilTestMetadata.referenceSource} <a href={report.soilTestMetadata.referenceUrl ?? "#"} target="_blank" rel="noreferrer">({tr("open reference")})</a></>}</p>
    <p className="muted"><strong>{copy(locale, "Missing information")}:</strong> {report.soilTestMetadata.missing.length ? report.soilTestMetadata.missing.map(missingLabel).join("; ") : copy(locale, "No missing information was detected for the entered test results.")} {copy(locale, "Unknown is shown when a required value or compatible method, unit, basis or reference is missing.")}</p>
    <p className="soil-health-caution">{copy(locale, "This is a soil screening class, not a fertilizer dose.")} {copy(locale, "The regional fertilizer rate is displayed separately and is not changed by these soil screening results.")}</p>
    {report.ph.sourceUrl && <a href={report.ph.sourceUrl} target="_blank" rel="noreferrer">{copy(locale, "pH screening source")}: {report.ph.reference?.source}</a>}
  </section>;
}

function SoilValueField({ title, unit, method, basis, onUnit, onMethod, onBasis, methods }: { title: string; unit: string; method: string; basis?: string; onUnit: (value: string) => void; onMethod: (value: string) => void; onBasis?: (value: string) => void; methods: [string, string][] }) {
  const phosphorus = title.endsWith(" P");
  return <div className="field"><strong>{title}</strong>
    <select aria-label={`${title} unit`} value={unit} onChange={event => onUnit(event.target.value)}><option value="UNKNOWN">Unit not recorded</option>{["kg/ha", "kg/acre", "mg/kg", "ppm"].map(item => <option key={item} value={item}>{item}</option>)}</select>
    {onBasis && <select aria-label={`${title} reporting basis`} value={basis} onChange={event => onBasis(event.target.value)}><option value="UNKNOWN">Reporting basis not recorded</option><option value={phosphorus ? "P" : "K"}>{phosphorus ? "Elemental P" : "Elemental K"}</option><option value={phosphorus ? "P2O5" : "K2O"}>{phosphorus ? "P₂O₅" : "K₂O"}</option></select>}
    <select aria-label={`${title} test method`} value={method} onChange={event => onMethod(event.target.value)}><option value="">Method not recorded</option>{methods.map(([id, label]) => <option key={id} value={id}>{label}</option>)}<option value="OTHER">Other method</option>{method && method !== "OTHER" && !methods.some(([id]) => id === method) && <option value={method}>{method}</option>}</select>
  </div>;
}
