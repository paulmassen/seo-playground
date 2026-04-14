'use server';

import { getCredentials, saveReviewsTask } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function submitReviewsTaskAction(formData: FormData) {
  const keyword = (formData.get('keyword') as string)?.trim();
  const location = (formData.get('location') as string)?.trim() || 'France';
  const language = (formData.get('language') as string)?.trim() || 'French';
  const depth = parseInt((formData.get('depth') as string) || '100', 10);
  const sortBy = (formData.get('sort_by') as string) || 'newest';

  if (!keyword) return;

  const creds = getCredentials();
  if (!creds) return;

  const auth = btoa(`${creds.login}:${creds.pass}`);

  const res = await fetch('https://api.dataforseo.com/v3/business_data/google/reviews/task_post', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      keyword,
      location_name: location,
      language_name: language,
      depth,
      sort_by: sortBy,
    }]),
    cache: 'no-store',
  });

  if (!res.ok) return;

  const data = await res.json() as {
    cost?: number;
    tasks?: Array<{ id?: string; status_code?: number; status_message?: string }>;
  };

  const task = data?.tasks?.[0];
  if (!task?.id || task.status_code !== 20100) return;

  // data.cost is the top-level cost from the task_post response
  saveReviewsTask(task.id, keyword, location, language, depth, sortBy, data.cost);
  revalidatePath('/dashboard/google-reviews');
}
