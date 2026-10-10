'use server'

import { runWithCurrentProject } from '@/lib/db';

import { saveCredentials, clearCredentials, setSetting } from '@/lib/db';
import { BRAND_SETTING_KEYS } from '@/lib/brand-server';
import { cleanBrandFooter, cleanBrandName, normalizeHeaderStyle, normalizeHexColor, validateLogoUpload } from '@/lib/brand';
import { GRID_PREFERENCE_KEYS, normalizeDistanceUnit, normalizePinStyle } from '@/lib/grid-preferences';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function updateSettings(formData: FormData) {
  return runWithCurrentProject(async () => {
    const user = formData.get('login') as string;
    const pass = formData.get('password') as string;
    if (user && pass) saveCredentials(user, pass);

    const brandName = cleanBrandName(formData.get('brand_name') as string);
    setSetting(BRAND_SETTING_KEYS.name, brandName);

    // An empty or invalid colour falls back to the default report colour.
    const rawColor = (formData.get('brand_color') as string | null)?.trim() ?? '';
    setSetting(BRAND_SETTING_KEYS.color, normalizeHexColor(rawColor) ?? '');

    setSetting(BRAND_SETTING_KEYS.footer, cleanBrandFooter(formData.get('brand_footer') as string));

    // Empty or invalid values are stored as '' so the read path falls back to the defaults.
    setSetting(BRAND_SETTING_KEYS.headerStyle, normalizeHeaderStyle(formData.get('brand_header_style') as string));
    setSetting(BRAND_SETTING_KEYS.footerTextColor, normalizeHexColor(formData.get('brand_footer_text_color') as string) ?? '');
    setSetting(BRAND_SETTING_KEYS.footerLinkColor, normalizeHexColor(formData.get('brand_footer_link_color') as string) ?? '');
    setSetting(BRAND_SETTING_KEYS.footerBackground, normalizeHexColor(formData.get('brand_footer_background') as string) ?? '');

    const logo = formData.get('brand_logo');
    if (formData.get('remove_logo') === 'true') {
      setSetting(BRAND_SETTING_KEYS.logoData, '');
      setSetting(BRAND_SETTING_KEYS.logoUrl, '');
    } else if (logo instanceof File && logo.size > 0) {
      const error = validateLogoUpload(logo.type, logo.size);
      if (error) throw new Error(error);
      const base64 = Buffer.from(await logo.arrayBuffer()).toString('base64');
      setSetting(BRAND_SETTING_KEYS.logoData, `data:${logo.type};base64,${base64}`);
      // An uploaded logo replaces any remote URL configured before uploads existed.
      setSetting(BRAND_SETTING_KEYS.logoUrl, '');
    }

    setSetting(GRID_PREFERENCE_KEYS.distanceUnit, normalizeDistanceUnit(formData.get('grid_distance_unit') as string | null));
    setSetting(GRID_PREFERENCE_KEYS.pinStyle, normalizePinStyle(formData.get('grid_pin_style') as string | null));

    revalidatePath('/dashboard/settings');
    revalidatePath('/dashboard/geo-grid');
  });
}

export async function deleteCredentials() {
  return runWithCurrentProject(async () => {
    clearCredentials();
    revalidatePath('/dashboard');
    redirect('/dashboard/settings');
  });
}
