"use client";

import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { applyOpeningHoursGroup, getOpeningHoursGroup, OPENING_HOUR_GROUPS } from "../../../utils/visitUs.js";
import { SettingsCard, Toggle, settingsInputClass } from "./settingsUi.jsx";

export default function BusinessHoursSettings({ value, onChange }) {
  const updateGroup = (group, nextValue) => onChange(applyOpeningHoursGroup(value, group, nextValue));

  return (
    <SettingsCard icon={CalendarClock} title="Business Hours" description="Control the Sat–Thu schedule and Friday schedule in Asia/Riyadh. Closing times may pass midnight.">
      <div className="space-y-3">
        {OPENING_HOUR_GROUPS.map((group) => {
          const groupValue = getOpeningHoursGroup(value, group);
          const updatePeriod = (periodIndex, field, nextValue) => updateGroup(group, {
            ...groupValue,
            periods: groupValue.periods.map((period, position) => position === periodIndex ? { ...period, [field]: nextValue } : period),
          });
          const addPeriod = () => updateGroup(group, { ...groupValue, periods: [...groupValue.periods, { open: "18:00", close: "23:00" }] });
          const removePeriod = (periodIndex) => updateGroup(group, { ...groupValue, periods: groupValue.periods.filter((_, position) => position !== periodIndex) });
          return <div key={group.id} className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="w-full sm:w-36"><Toggle checked={groupValue.isOpen} onChange={(isOpen) => updateGroup(group, { ...groupValue, isOpen, periods: groupValue.periods.length ? groupValue.periods : [{ open: group.defaultOpen, close: "23:00" }] })} label={group.label} /></div>
              {groupValue.isOpen ? <div className="flex min-w-0 flex-1 flex-col gap-2">
                {groupValue.periods.map((period, periodIndex) => (
                  <div key={`${group.id}-${periodIndex}`} className="flex items-center gap-2">
                    <input aria-label={`${group.label} opening time ${periodIndex + 1}`} type="time" value={period.open} onChange={(event) => updatePeriod(periodIndex, "open", event.target.value)} className={`${settingsInputClass} min-w-0 [color-scheme:dark]`} />
                    <span className="text-xs text-neutral-600">to</span>
                    <input aria-label={`${group.label} closing time ${periodIndex + 1}`} type="time" value={period.close} onChange={(event) => updatePeriod(periodIndex, "close", event.target.value)} className={`${settingsInputClass} min-w-0 [color-scheme:dark]`} />
                    {groupValue.periods.length > 1 && <button type="button" onClick={() => removePeriod(periodIndex)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10" aria-label={`Remove ${group.label} service period`}><Trash2 className="h-4 w-4" /></button>}
                  </div>
                ))}
                {groupValue.periods.length < 2 && <button type="button" onClick={addPeriod} className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-dune-amber hover:text-dune-amberLight"><Plus className="h-3.5 w-3.5" />Add second service period</button>}
                {groupValue.mixed && <p className="text-xs text-amber-300">Previously saved daily schedules differ. Editing this group will apply one schedule to every included day.</p>}
              </div> : <p className="text-xs text-neutral-600">Closed all day</p>}
            </div>
          </div>;
        })}
      </div>
    </SettingsCard>
  );
}
