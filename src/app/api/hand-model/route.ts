import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export async function GET(): Promise<Response> {
  try {
    const upstream = await fetch(MODEL_URL, {
      cache: 'force-cache',
      next: { revalidate: 86400 },
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Hand model upstream returned ${upstream.status}` },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
        'X-PRISM-Model-Proxy': 'mediapipe-hand-landmarker',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to proxy hand model' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
