import type { DistanceUnit, GridPreferences, PinStyle } from '@/lib/grid-preferences';

const UNIT_OPTIONS: { value: DistanceUnit; label: string; detail: string }[] = [
  { value: 'km', label: 'Kilometres', detail: '0.5 · 1 · 2 · 3 · 5 · 10 km' },
  { value: 'mi', label: 'Miles', detail: '0.25 · 0.5 · 1 · 2 · 3 · 5 mi' },
];

const PIN_OPTIONS: { value: PinStyle; label: string; detail: string }[] = [
  { value: 'square', label: 'Squares', detail: 'Classic, largest labels' },
  { value: 'circle', label: 'Circles', detail: 'Rounded, more map visible' },
  { value: 'dot', label: 'Small dots', detail: 'Compact, most map visible' },
];

// Sample ranks for the 3×3 preview; the middle one is the grid center.
const PREVIEW = [
  { rank: '2', color: '#10b981' }, { rank: '5', color: '#14b8a6' }, { rank: '12', color: '#f59e0b' },
  { rank: '4', color: '#14b8a6' }, { rank: '3', color: '#10b981' }, { rank: '9', color: '#3b82f6' },
  { rank: '18', color: '#f97316' }, { rank: '24', color: '#ef4444' }, { rank: '—', color: '#94a3b8' },
];

const PIN_PREVIEW_STYLE: Record<PinStyle, { size: number; radius: string; font: number; ring: string }> = {
  square: { size: 22, radius: '5px', font: 9, ring: '1.5px solid rgba(255,255,255,0.4)' },
  circle: { size: 20, radius: '50%', font: 8, ring: '1.5px solid rgba(255,255,255,0.95)' },
  dot: { size: 14, radius: '50%', font: 6.5, ring: '1px solid rgba(255,255,255,0.95)' },
};

// A faint street pattern so the preview shows how much of the basemap each style leaves visible.
const MAP_BACKGROUND = [
  'linear-gradient(90deg, transparent 47%, #fde68a 47%, #fde68a 53%, transparent 53%)',
  'linear-gradient(0deg, transparent 30%, #ffffff 30%, #ffffff 34%, transparent 34%)',
  'linear-gradient(0deg, transparent 70%, #ffffff 70%, #ffffff 73%, transparent 73%)',
  'linear-gradient(90deg, transparent 18%, #ffffff 18%, #ffffff 21%, transparent 21%)',
  'linear-gradient(90deg, transparent 80%, #ffffff 80%, #ffffff 83%, transparent 83%)',
  'linear-gradient(135deg, #e9efe4 0%, #eef2f6 55%, #e5ecf3 100%)',
].join(', ');

function PinPreview({ style }: { style: PinStyle }) {
  const pin = PIN_PREVIEW_STYLE[style];
  return (
    <div className="grid h-24 place-items-center rounded-xl border border-slate-200 dark:border-slate-700" style={{ background: MAP_BACKGROUND }} aria-hidden="true">
      <div className="grid grid-cols-3 gap-x-4 gap-y-3">
        {PREVIEW.map((point, index) => (
          <span
            key={index}
            className="grid place-items-center font-black text-white"
            style={{
              width: pin.size, height: pin.size, borderRadius: pin.radius, background: point.color, fontSize: pin.font,
              border: index === 4 ? '1.5px dashed rgba(255,255,255,0.9)' : pin.ring,
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }}
          >
            {point.rank}
          </span>
        ))}
      </div>
    </div>
  );
}

const cardCls = 'block cursor-pointer rounded-2xl border border-slate-200 bg-white p-3 transition-all hover:border-slate-300 peer-checked:border-blue-500 peer-checked:ring-4 peer-checked:ring-blue-500/10 peer-focus-visible:ring-4 peer-focus-visible:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:peer-checked:border-blue-400';

export default function GridPreferenceFields({ initial }: { initial: GridPreferences }) {
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2">Distance unit</legend>
        <div className="grid grid-cols-2 gap-3">
          {UNIT_OPTIONS.map((option) => (
            <label key={option.value} className="relative">
              <input type="radio" name="grid_distance_unit" value={option.value} defaultChecked={initial.distanceUnit === option.value} className="peer sr-only" />
              <span className={cardCls}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{option.label}</span>
                  <span className="font-mono text-xs font-bold text-slate-400">{option.value}</span>
                </span>
                <span className="mt-1 block text-[11px] text-slate-400">{option.detail}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 ml-1 text-[11px] text-slate-400">Spacing choices, distances and PDF reports use this unit. Existing monitors keep their exact grid.</p>
      </fieldset>

      <fieldset>
        <legend className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2">Map pin style</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PIN_OPTIONS.map((option) => (
            <label key={option.value} className="relative">
              <input type="radio" name="grid_pin_style" value={option.value} defaultChecked={initial.pinStyle === option.value} className="peer sr-only" />
              <span className={cardCls}>
                <PinPreview style={option.value} />
                <span className="mt-2.5 block text-sm font-bold text-slate-900 dark:text-white">{option.label}</span>
                <span className="block text-[11px] text-slate-400">{option.detail}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 ml-1 text-[11px] text-slate-400">The #1 rank keeps its star in every style.</p>
      </fieldset>
    </div>
  );
}
