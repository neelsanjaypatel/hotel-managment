"use client";

import { useState } from "react";
import { ActionForm } from "@/components/forms";
import { saveAttendance } from "@/lib/actions";

type Row = { id: number; name: string; department: string; payType: string; status: string | null; ot: number };
const STATUSES = [
  { v: "P", label: "Present" },
  { v: "A", label: "Absent" },
  { v: "H", label: "Half day" },
  { v: "L", label: "Leave" },
  { v: "WO", label: "Week off" },
];

export function AttendanceGrid({ date, rows }: { date: string; rows: Row[] }) {
  const [status, setStatus] = useState<Record<number, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.status ?? ""])));
  const unmarked = rows.filter((r) => !status[r.id]).length;
  return (
    <ActionForm action={saveAttendance} submit="Save attendance" resetOnOk={false}>
      <input type="hidden" name="date" value={date} />
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setStatus((s) => Object.fromEntries(rows.map((r) => [r.id, s[r.id] || "P"])))}
        >
          Mark rest present
        </button>
        <span className="text-muted">{unmarked === 0 ? "Everyone marked" : `${unmarked} not marked`}</span>
      </div>
      <div className="-mx-4 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>Employee</th><th>Status</th><th className="r">OT hrs</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <input type="hidden" name="employeeId" value={r.id} />
                  <input type="hidden" name={`s_${r.id}`} value={status[r.id] ?? ""} />
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted">{r.department} · {r.payType === "daily" ? "Daily wage" : "Monthly"}</div>
                </td>
                <td>
                  <div className="inline-flex overflow-hidden rounded-lg border border-line" role="radiogroup" aria-label={`Status for ${r.name}`}>
                    {STATUSES.map((s) => {
                      const on = status[r.id] === s.v;
                      const tone = s.v === "A" ? "bg-expense text-white" : s.v === "P" ? "bg-accent text-accent-ink" : "bg-warn text-white";
                      return (
                        <button
                          key={s.v}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          title={s.label}
                          onClick={() => setStatus((x) => ({ ...x, [r.id]: s.v }))}
                          className={`min-w-10 px-2.5 py-1.5 text-xs font-semibold transition-colors ${on ? tone : "text-muted hover:bg-surface-2"}`}
                        >
                          {s.v}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="r">
                  <input name={`ot_${r.id}`} defaultValue={r.ot || ""} inputMode="decimal" className="field w-16 text-right" aria-label={`Overtime hours for ${r.name}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ActionForm>
  );
}
