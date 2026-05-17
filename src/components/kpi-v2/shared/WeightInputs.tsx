"use client";

interface WeightInputsProps {
  weightOmzet: number;
  weightAtv: number;
  weightAtu: number;
  onChangeOmzet: (value: number) => void;
  onChangeAtv: (value: number) => void;
  onChangeAtu: (value: number) => void;
  isAtvEnabled: boolean;
  isAtuEnabled: boolean;
}

export function WeightInputs({
  weightOmzet,
  weightAtv,
  weightAtu,
  onChangeOmzet,
  onChangeAtv,
  onChangeAtu,
  isAtvEnabled,
  isAtuEnabled,
}: WeightInputsProps) {
  const total = weightOmzet + (isAtvEnabled ? weightAtv : 0) + (isAtuEnabled ? weightAtu : 0);
  const isValid = total === 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Bobot Komponen Target
        </label>
        {!isValid && (
          <span className="text-[9px] font-black text-amber-600 uppercase px-2 py-1 bg-amber-50 rounded">
            Total: {total}% (Rekomendasi 100%)
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Omzet */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <span className="text-[10px] font-black text-slate-400 uppercase block mb-2">Omzet</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={weightOmzet}
              onChange={(e) => onChangeOmzet(parseInt(e.target.value, 10) || 0)}
              min={0}
              max={100}
              className="w-full bg-transparent border-none p-0 text-xl font-black text-slate-800 focus:ring-0"
            />
            <span className="font-black text-emerald-500">%</span>
          </div>
        </div>

        {/* ATV */}
        {isAtvEnabled && (
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-[10px] font-black text-slate-400 uppercase block mb-2">ATV</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={weightAtv}
                onChange={(e) => onChangeAtv(parseInt(e.target.value, 10) || 0)}
                min={0}
                max={100}
                className="w-full bg-transparent border-none p-0 text-xl font-black text-slate-800 focus:ring-0"
              />
              <span className="font-black text-sky-500">%</span>
            </div>
          </div>
        )}

        {/* ATU */}
        {isAtuEnabled && (
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-[10px] font-black text-slate-400 uppercase block mb-2">ATU</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={weightAtu}
                onChange={(e) => onChangeAtu(parseInt(e.target.value, 10) || 0)}
                min={0}
                max={100}
                className="w-full bg-transparent border-none p-0 text-xl font-black text-slate-800 focus:ring-0"
              />
              <span className="font-black text-indigo-500">%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
