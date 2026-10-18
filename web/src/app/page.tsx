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
  // Only the built-in dev codes are worth hinting; once real codes are set, the hint would lie.
  const devCodes = !process.env.OFFICER_PASSCODE && !process.env.DISPATCH_PASSCODE;
  return <SignIn next={next} showHints={process.env.NODE_ENV !== 'production' && devCodes} />;
}
