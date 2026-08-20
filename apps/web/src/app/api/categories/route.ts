import { NextResponse } from 'next/server';
import { CATEGORIES } from '@wts/analyzers';

export const runtime = 'nodejs';

/**
 * Serves the category registry to the selection UI, so the options a tester
 * sees are always exactly the analyzers that exist.
 */
export function GET() {
  return NextResponse.json({ categories: CATEGORIES });
}
