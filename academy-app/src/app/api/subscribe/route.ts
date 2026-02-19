import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { subscribeToConvertKit } from '@/lib/convertkit';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('Invalid email address'),
});

/** POST /api/subscribe — email capture with validation */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = schema.parse(body);

    // Check for existing subscriber
    const existing = await prisma.emailSubscriber.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ message: 'Already subscribed' }, { status: 200 });
    }

    // Save to database
    await prisma.emailSubscriber.create({ data: { email } });

    // Forward to ConvertKit (non-blocking)
    subscribeToConvertKit(email).catch(console.error);

    return NextResponse.json({ message: 'Subscribed successfully' }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error('Subscribe error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
