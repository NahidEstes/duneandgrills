"use client";

import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { SettingsCard, Toggle, settingsInputClass } from "./settingsUi.jsx";

const DAY_LABELS = {
  sunday: "Sunday", monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday",
};

export default function BusinessHoursSettings({ value, onChange }) {
  const updateDay = (index, patch) => onChange(value.map((day, position) => position === index ? { ...day, ...patch } : day));
  const updatePeriod = (dayIndex, periodIndex, field, nextValue) => updateDay(dayIndex, {
    periods: value[dayIndex].periods.map((period, position) => position === periodIndex ? { ...period, [field]: nextValue } : period),
  });
  const addPeriod = (index) => updateDay(index, { periods: [...value[index].periods, { open: "18:00", close: "23:00" }] });
  const removePeriod = (dayIndex, periodIndex) => updateDay(dayIndex, { periods: value[dayIndex].periods.filter((_, position) => position !== periodIndex) });

  return (
    <SettingsCard icon={CalendarClock} title="Business Hours" description="Customer-facing weekly schedule in Asia/Riyadh. Closing times may pass midnight.">
      <div className="space-y-3">
        {value.map((day, dayIndex) => (
          <div key={day.day} className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="w-full sm:w-36"><Toggle checked={day.isOpen} onChange={(isOpen) => updateDay(dayIndex, { isOpen, periods: day.periods.length ? day.periods : [{ open: "11:00", close: "23:00" }] })} label={DAY_LABELS[day.day]} /></div>
              {day.isOpen ? <div className="flex min-w-0 flex-1 flex-col gap-2">
                {day.periods.map((period, periodIndex) => (
                  <div key={`${day.day}-${periodIndex}`} className="flex items-center gap-2">
                    <input aria-label={`${DAY_LABELS[day.day]} opening time ${periodIndex + 1}`} type="time" value={period.open} onChange={(event) => updatePeriod(dayIndex, periodIndex, "open", event.target.value)} className={`${settingsInputClass} min-w-0 [color-scheme:dark]`} />
                    <span className="text-xs text-neutral-600">to</span>
                    <input aria-label={`${DAY_LABELS[day.day]} closing time ${periodIndex + 1}`} type="time" value={period.close} onChange={(event) => updatePeriod(dayIndex, periodIndex, "close", event.target.value)} className={`${settingsInputClass} min-w-0 [color-scheme:dark]`} />
                    {day.periods.length > 1 && <button type="button" onClick={() => removePeriod(dayIndex, periodIndex)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10" aria-label={`Remove ${DAY_LABELS[day.day]} service period`}><Trash2 className="h-4 w-4" /></button>}
                  </div>
                ))}
                {day.periods.length < 2 && <button type="button" onClick={() => addPeriod(dayIndex)} className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-dune-amber hover:text-dune-amberLight"><Plus className="h-3.5 w-3.5" />Add second service period</button>}
              </div> : <p className="text-xs text-neutral-600">Closed all day</p>}
            </div>
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}
