'use server'

import { saveCredentials } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function saveCredentialsAction(formData: FormData) {
  const login = formData.get('login');
  const password = formData.get('password');
  if (!login || !password || typeof login !== 'string' || typeof password !== 'string') return;
  saveCredentials(login, password);
  revalidatePath('/dashboard');
}
