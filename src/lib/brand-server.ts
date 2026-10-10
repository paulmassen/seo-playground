import { getSetting } from './db';
import {
  DEFAULT_BRAND_COLOR,
  DEFAULT_BRAND_NAME,
  DEFAULT_FOOTER_BACKGROUND,
  DEFAULT_FOOTER_LINK_COLOR,
  DEFAULT_FOOTER_TEXT_COLOR,
  cleanBrandFooter,
  colorOr,
  normalizeHeaderStyle,
  type BrandSettings,
} from './brand';

export const BRAND_SETTING_KEYS = {
  name: 'brand_name',
  logoData: 'brand_logo_data',
  /** Legacy: a remote logo URL entered before logo uploads existed. */
  logoUrl: 'brand_logo_url',
  color: 'brand_color',
  footer: 'brand_footer',
  headerStyle: 'brand_header_style',
  footerTextColor: 'brand_footer_text_color',
  footerLinkColor: 'brand_footer_link_color',
  footerBackground: 'brand_footer_background',
} as const;

/** Reads the white-label identity stored in Settings, with defaults for anything left blank. */
export function getBrandSettings(): BrandSettings {
  const name = getSetting(BRAND_SETTING_KEYS.name)?.trim() || DEFAULT_BRAND_NAME;
  const logo = getSetting(BRAND_SETTING_KEYS.logoData)?.trim() || getSetting(BRAND_SETTING_KEYS.logoUrl)?.trim() || null;
  return {
    name,
    logo,
    color: colorOr(getSetting(BRAND_SETTING_KEYS.color), DEFAULT_BRAND_COLOR),
    footer: cleanBrandFooter(getSetting(BRAND_SETTING_KEYS.footer)),
    headerStyle: normalizeHeaderStyle(getSetting(BRAND_SETTING_KEYS.headerStyle)),
    footerTextColor: colorOr(getSetting(BRAND_SETTING_KEYS.footerTextColor), DEFAULT_FOOTER_TEXT_COLOR),
    footerLinkColor: colorOr(getSetting(BRAND_SETTING_KEYS.footerLinkColor), DEFAULT_FOOTER_LINK_COLOR),
    footerBackground: colorOr(getSetting(BRAND_SETTING_KEYS.footerBackground), DEFAULT_FOOTER_BACKGROUND),
  };
}
