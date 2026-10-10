'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Upload, X } from 'lucide-react';
import {
  BRAND_FOOTER_MAX_LENGTH,
  BRAND_HEADER_STYLES,
  BRAND_NAME_MAX_LENGTH,
  DEFAULT_BRAND_COLOR,
  DEFAULT_BRAND_NAME,
  DEFAULT_FOOTER_BACKGROUND,
  DEFAULT_FOOTER_LINK_COLOR,
  DEFAULT_FOOTER_TEXT_COLOR,
  brandPalette,
  footerSegments,
  normalizeHexColor,
  validateLogoUpload,
  type BrandHeaderStyle,
  type BrandStyle,
} from '@/lib/brand';

const inputCls = 'w-full px-5 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-600 transition-all font-medium';
const labelCls = 'text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1';

type Props = {
  initialName: string;
  initialColor: string;
  initialFooter: string;
  initialStyle: BrandStyle;
  /** Current logo as a data URL or remote URL, or null when none is configured. */
  currentLogo: string | null;
};

const HEADER_STYLE_LABELS: Record<BrandHeaderStyle, string> = { solid: 'Straight bar', wave: 'Wavy bar' };

/** Colour picker and hex field kept in sync. The parent only receives valid colours. */
function ColorField({ id, name, label, value, fallback, onChange }: { id: string; name: string; label: string; value: string; fallback: string; onChange: (hex: string) => void }) {
  const [draft, setDraft] = useState(value);
  const valid = normalizeHexColor(draft) !== null;

  function onTyped(next: string) {
    setDraft(next);
    const normalized = normalizeHexColor(next);
    if (normalized) onChange(normalized);
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className={labelCls}>{label}</label>
      <div className="flex items-center gap-3">
        <input type="color" aria-label={label} value={value} onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }} className="h-[52px] w-14 shrink-0 cursor-pointer rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800" />
        <input id={id} name={name} type="text" value={draft} onChange={(e) => onTyped(e.target.value)} maxLength={7} placeholder={fallback} className={inputCls} />
      </div>
      {!valid && <p className="text-[10px] font-bold text-red-600 dark:text-red-400 ml-1">Use a hex colour such as #0f172a.</p>}
    </div>
  );
}

export default function BrandIdentityFields({ initialName, initialColor, initialFooter, initialStyle, currentLogo }: Props) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(normalizeHexColor(initialColor) ?? DEFAULT_BRAND_COLOR);
  const [footer, setFooter] = useState(initialFooter);
  const [headerStyle, setHeaderStyle] = useState<BrandHeaderStyle>(initialStyle.headerStyle);
  const [footerTextColor, setFooterTextColor] = useState(initialStyle.footerTextColor);
  const [footerLinkColor, setFooterLinkColor] = useState(initialStyle.footerLinkColor);
  const [footerBackground, setFooterBackground] = useState(initialStyle.footerBackground);
  const [logoPreview, setLogoPreview] = useState<string | null>(currentLogo);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [pendingObjectUrl, setPendingObjectUrl] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl); }, [pendingObjectUrl]);

  const palette = brandPalette(color);
  const fillCss = `rgb(${palette.fill.join(',')})`;
  const textCss = `rgb(${palette.text.join(',')})`;
  const subtleCss = `rgb(${palette.subtle.join(',')})`;
  const previewName = name.trim() || DEFAULT_BRAND_NAME;
  const previewFooter = footer.trim() || `${previewName} · Example report`;

  function onLogoChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setLogoError(null);
    if (!file) return;
    const error = validateLogoUpload(file.type, file.size);
    if (error) {
      setLogoError(error);
      event.target.value = '';
      return;
    }
    const url = URL.createObjectURL(file);
    if (pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl);
    setPendingObjectUrl(url);
    setLogoPreview(url);
    setRemoveLogo(false);
  }

  function clearLogo() {
    if (fileInput.current) fileInput.current.value = '';
    if (pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl);
    setPendingObjectUrl(null);
    setLogoPreview(null);
    setLogoError(null);
    setRemoveLogo(true);
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label htmlFor="brand_name" className={labelCls}>Brand name</label>
          <input id="brand_name" name="brand_name" type="text" maxLength={BRAND_NAME_MAX_LENGTH} value={name} onChange={(e) => setName(e.target.value)} placeholder={DEFAULT_BRAND_NAME} className={inputCls} />
        </div>
        <div className="space-y-2">
          <label htmlFor="brand_footer" className={labelCls}>Footer text</label>
          <input id="brand_footer" name="brand_footer" type="text" maxLength={BRAND_FOOTER_MAX_LENGTH} value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="e.g. Acme SEO · hello@acme.com · acme.com" className={inputCls} />
          <p className="text-[10px] text-slate-400 ml-1">Printed at the bottom of every PDF page. E-mail addresses and domains become clickable links.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label htmlFor="brand_logo" className={labelCls}>Logo</label>
          <div className="flex items-center gap-3">
            <label htmlFor="brand_logo" className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 transition-colors hover:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Upload className="h-3.5 w-3.5" /> {logoPreview ? 'Replace logo' : 'Upload logo'}
            </label>
            {logoPreview && (
              <button type="button" onClick={clearLogo} className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-red-600 hover:text-red-700 dark:text-red-400">
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            )}
            <input ref={fileInput} id="brand_logo" name="brand_logo" type="file" accept="image/png,image/jpeg" onChange={onLogoChosen} className="sr-only" />
            <input type="hidden" name="remove_logo" value={removeLogo ? 'true' : 'false'} />
          </div>
          <p className="text-[10px] text-slate-400 ml-1">PNG or JPEG, 256 KB max. Replaces the brand name in PDF headers.</p>
          {logoError && <p className="text-[10px] font-bold text-red-600 dark:text-red-400 ml-1">{logoError}</p>}
        </div>

        <div className="space-y-2">
          <p className={labelCls}>Header style</p>
          <div role="radiogroup" aria-label="Header style" className="grid grid-cols-2 gap-2">
            {BRAND_HEADER_STYLES.map((style) => (
              <label key={style} className={`cursor-pointer rounded-2xl border px-4 py-3 text-xs font-bold transition-colors ${headerStyle === style ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                <input type="radio" name="brand_header_style" value={style} checked={headerStyle === style} onChange={() => setHeaderStyle(style)} className="sr-only" />
                {HEADER_STYLE_LABELS[style]}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ColorField id="brand_color_text" name="brand_color" label="Report colour" value={color} fallback={DEFAULT_BRAND_COLOR} onChange={setColor} />
        <ColorField id="brand_footer_background_text" name="brand_footer_background" label="Footer background" value={footerBackground} fallback={DEFAULT_FOOTER_BACKGROUND} onChange={setFooterBackground} />
        <ColorField id="brand_footer_text_color_text" name="brand_footer_text_color" label="Footer text colour" value={footerTextColor} fallback={DEFAULT_FOOTER_TEXT_COLOR} onChange={setFooterTextColor} />
        <ColorField id="brand_footer_link_color_text" name="brand_footer_link_color" label="Footer link colour" value={footerLinkColor} fallback={DEFAULT_FOOTER_LINK_COLOR} onChange={setFooterLinkColor} />
      </div>

      {/* Live preview of the PDF header and footer */}
      <div className="space-y-2">
        <p className={labelCls}>Preview</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700">
          <div className={`relative flex items-center justify-between gap-4 px-6 ${headerStyle === 'wave' ? 'pb-7 pt-5' : 'py-5'}`} style={{ background: fillCss }}>
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="" className="max-h-10 max-w-[140px] object-contain" />
            ) : (
              <span className="text-lg font-black tracking-tight" style={{ color: textCss }}>{previewName}</span>
            )}
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: subtleCss }}>SEO Report</p>
              <p className="text-sm font-bold" style={{ color: textCss }}>Example report</p>
            </div>
            {headerStyle === 'wave' && (
              <svg aria-hidden="true" viewBox="0 0 100 8" preserveAspectRatio="none" className="absolute bottom-[-1px] left-0 h-3 w-full" style={{ fill: fillCss }}>
                <path d="M0 0H100V4C80 0 70 8 50 4S20 0 0 4Z" />
              </svg>
            )}
          </div>
          <div className="px-6 py-3 text-[10px]" style={{ background: footerBackground, color: footerTextColor }}>
            <div className="flex items-center justify-between gap-4">
              <span className="truncate">
                {footerSegments(previewFooter).map((segment, index) => (
                  <span key={index} style={segment.href ? { color: footerLinkColor, textDecoration: 'underline' } : undefined}>{segment.text}</span>
                ))}
              </span>
              <span className="font-mono">1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
