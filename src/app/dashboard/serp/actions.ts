'use server'

import { addTargetDomain, removeTargetDomain } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function addDomainAction(formData: FormData) {
  const domain = (formData.get('domain') as string)?.trim();
  if (!domain) return;
  addTargetDomain(domain);
  revalidatePath('/dashboard/serp');
}

export async function removeDomainAction(domain: string) {
  removeTargetDomain(domain);
  revalidatePath('/dashboard/serp');
}
