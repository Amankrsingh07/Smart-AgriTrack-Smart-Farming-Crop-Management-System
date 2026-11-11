"use client";

import { useState } from "react";

type CropOption = { id: string; name: string; illustrative: boolean; climateRequirement: { cropDurationDays: number | null } | null };
export default function CropPicker({ crops }: { crops: CropOption[] }) {
  const [adding, setAdding] = useState(false);
  const [cropId, setCropId] = useState(crops[0]?.id ?? "__new__");
  const [duration, setDuration] = useState(crops[0]?.climateRequirement?.cropDurationDays?.toString() ?? "");
  const selected = crops.find(crop => crop.id === cropId);
  function select(value: string) {
    setCropId(value); setAdding(value === "__new__");
    if (value !== "__new__") { const profileDays = crops.find(crop => crop.id === value)?.climateRequirement?.cropDurationDays; setDuration(profileDays?.toString() ?? ""); }
    else setDuration("");
  }
  return <>
    <div className="field"><label htmlFor="cropId">Crop</label>
      <select id="cropId" name="cropId" required value={cropId} onChange={event => select(event.target.value)}>
        {crops.map(c => <option key={c.id} value={c.id}>{c.name}{c.illustrative ? " · demonstration profile" : ""}</option>)}
        <option value="__new__">＋ Add a new crop…</option>
      </select>
    </div>
    {adding && <div className="field"><label htmlFor="newCropName">New crop name</label><input id="newCropName" name="newCropName" placeholder="e.g. Mustard" minLength={2} maxLength={80} required /></div>}
    <div className="field"><label htmlFor="cropDurationDays">Crop duration (days)</label><input id="cropDurationDays" name="cropDurationDays" type="number" min="1" max="730" step="1" value={duration} onChange={event => setDuration(event.target.value)} placeholder="Enter if known"/><small className="muted">{selected?.climateRequirement?.cropDurationDays ? "Pre-filled from the configured crop calendar; adjust for your variety if needed." : "Enter duration for this crop/variety to calculate its expected harvest date."}</small></div>
  </>;
}
