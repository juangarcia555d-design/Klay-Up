#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { supabase } from '../config/supabase.js';

async function markAdmin(email) {
  if (!email) {
    console.error('Usage: node mark_verified_admin.js user@example.com');
    process.exit(1);
  }
  try {
    const { data, error } = await supabase.from('usuarios').update({ verified_role: 'ADMIN' }).eq('email', email).select().maybeSingle();
    if (error) {
      console.error('Error updating user:', error.message || error);
      process.exit(2);
    }
    if (!data) {
      console.error('No user found with email:', email);
      process.exit(3);
    }
    console.log('User updated:', data);
    process.exit(0);
  } catch (e) {
    console.error('Unexpected error marking admin:', e && e.message ? e.message : e);
    process.exit(4);
  }
}

const emailArg = process.argv[2] || process.env.MARK_EMAIL;
markAdmin(emailArg);
