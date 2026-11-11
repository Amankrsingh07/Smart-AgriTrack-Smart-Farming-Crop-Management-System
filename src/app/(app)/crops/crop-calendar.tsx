"use client";

import { useState } from "react";
import { addCropCalendarEvent, deleteCropCalendarEvent } from "../../actions";

type Cycle = {
  id: string;
  crop: string;
  field: string;
  farm: string;
  sowingDate: string | null;
  harvestDate: string | null;
  harvestAlert: { severity: "red" | "amber" | "green" | "neutral"; label: string };
};
type ManualEvent = {
  id: string;
  title: string;
  eventDate: string;
  notes: string | null;
  cropCycleId: string | null;
  crop: string | null;
  field: string | null;
};
type CalendarEvent = { title: string; detail: string; type: "automatic" | "manual"; severity?: "red" | "amber" | "green" };

export default function CropCalendar({ cycles, manualEvents, available = true }: { cycles: Cycle[]; manualEvents: ManualEvent[]; available?: boolean }) {
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const visibleMonths = [new Date(month.getFullYear(), month.getMonth(), 1)];
  const currentYear = new Date().getFullYear();
  const firstYear = Math.min(currentYear - 5, month.getFullYear());
  const lastYear = Math.max(currentYear + 10, month.getFullYear());
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
  const monthCells = (value: Date): Array<number | null> => {
    const first = new Date(value.getFullYear(), value.getMonth(), 1);
    const dayCount = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
    return [...Array(first.getDay()).fill(null), ...Array.from({ length: dayCount }, (_, index) => index + 1)];
  };
  const dateKey = (value: Date, day: number) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const events = new Map<string, CalendarEvent[]>();
  const addEvent = (date: string, event: CalendarEvent) => events.set(date, [...(events.get(date) ?? []), event]);

  for (const cycle of cycles) {
    const context = `${cycle.crop} · ${cycle.farm} / ${cycle.field}`;
    if (cycle.sowingDate) addEvent(cycle.sowingDate, { title: "Sowing", detail: context, type: "automatic" });
    if (cycle.harvestDate) addEvent(cycle.harvestDate, { title: "Expected harvest", detail: context, type: "automatic", severity: cycle.harvestAlert.severity === "neutral" ? undefined : cycle.harvestAlert.severity });
  }
  for (const item of manualEvents) {
    const context = item.crop ? `${item.crop}${item.field ? ` · ${item.field}` : ""}` : "Manual event";
    addEvent(item.eventDate, { title: item.title, detail: context, type: "manual" });
  }

  return <section className="panel crop-calendar">
    <div className="section-heading crop-calendar-heading">
      <div><p className="eyebrow">Farm planner</p><h2>Crop calendar</h2><p className="muted">Automatic sowing and expected harvest dates, plus events you add yourself.</p></div>
      <div className="crop-calendar-month"><button className="btn btn-secondary" type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>Previous</button><div className="crop-calendar-selectors"><select aria-label="Select month" value={month.getMonth()} onChange={event => setMonth(new Date(month.getFullYear(), Number(event.target.value), 1))}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{new Date(2020, index, 1).toLocaleDateString("en-IN", { month: "long" })}</option>)}</select><select aria-label="Select year" value={month.getFullYear()} onChange={event => setMonth(new Date(Number(event.target.value), month.getMonth(), 1))}>{years.map(year => <option key={year} value={year}>{year}</option>)}</select></div><button className="btn btn-secondary" type="button" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); }}>Today</button><button className="btn btn-secondary" type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>Next</button></div>
    </div>
    <div className="crop-calendar-legend"><span><i className="alert-dot green"/>Green · On track</span><span><i className="alert-dot amber"/>Amber · Harvest due within 7 days</span><span><i className="alert-dot red"/>Red · Overdue</span><span><i className="manual-dot"/>Manual event</span></div>
    <div className="crop-calendar-scroll" aria-label="Crop calendar">{visibleMonths.map(monthDate => <section className="crop-calendar-month-view" key={`${monthDate.getFullYear()}-${monthDate.getMonth()}`}><div className="crop-calendar-grid">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <strong key={day}>{day}</strong>)}{monthCells(monthDate).map((day, index) => day === null ? <span key={`blank-${index}`} className="calendar-blank"/> : <article className={dateKey(monthDate, day) === todayKey ? "is-today" : undefined} key={day}><b>{day}</b>{(events.get(dateKey(monthDate, day)) ?? []).map((event, eventIndex) => <small className={`crop-calendar-event ${event.type}${event.severity ? ` harvest-alert-${event.severity}` : ""}`} key={`${day}-${eventIndex}`} title={event.detail}><strong>{event.title}</strong><span>{event.detail}</span></small>)}</article>)}</div></section>)}</div>
    {!available && <p className="muted" role="status">Restart the development server to load manual calendar events and save new ones.</p>}
    {available && <details className="crop-calendar-add"><summary>Add a manual crop event</summary>
      <form action={addCropCalendarEvent} className="crop-calendar-form">
        <label className="field"><span>Event name</span><input name="title" minLength={2} maxLength={120} placeholder="e.g. Apply fertilizer" required/></label>
        <label className="field"><span>Date</span><input name="eventDate" type="date" required/></label>
        <label className="field"><span>Crop cycle (optional)</span><select name="cropCycleId" defaultValue=""><option value="">General farm event</option>{cycles.map(cycle => <option key={cycle.id} value={cycle.id}>{cycle.crop} · {cycle.farm} / {cycle.field}</option>)}</select></label>
        <label className="field"><span>Notes (optional)</span><input name="notes" maxLength={500} placeholder="Add a note"/></label>
        <button className="btn">Save event</button>
      </form>
    </details>}
    {manualEvents.length > 0 && <div className="crop-calendar-manual-list"><h3>Your manual events</h3>{manualEvents.map(item => <article key={item.id}><div><strong>{item.title}</strong><span>{item.eventDate}{item.crop ? ` · ${item.crop}${item.field ? ` · ${item.field}` : ""}` : " · General farm event"}</span>{item.notes && <small>{item.notes}</small>}</div><form action={deleteCropCalendarEvent}><input type="hidden" name="id" value={item.id}/><button className="subtle-link danger-link">Delete</button></form></article>)}</div>}
  </section>;
}
