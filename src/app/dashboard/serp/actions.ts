'use server'

import { runWithCurrentProject } from '@/lib/db';

import { addTargetDomain, removeTargetDomain } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function addDomainAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const domain = (formData.get('domain') as string)?.trim();
    if (!domain) return;
    addTargetDomain(domain);
    revalidatePath('/dashboard/serp');
  });
}

export async function removeDomainAction(domain: string) {
  return runWithCurrentProject(async () => {
    removeTargetDomain(domain);
    revalidatePath('/dashboard/serp');
  });
}
