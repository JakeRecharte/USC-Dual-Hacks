import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SignIn } from '@/components/sign-in';
import { HOME_FOR, ROLE_COOKIE, roleFromCookie } from '@/lib/auth';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Already signed in: go straight to the portal rather than asking again.
  const role = await roleFromCookie((await cookies()).get(ROLE_COOKIE)?.value);
  if (role) redirect(HOME_FOR[role]);

  const { next } = await searchParams;
  return <SignIn next={next} showHints={process.env.NODE_ENV !== 'production'} />;
}
