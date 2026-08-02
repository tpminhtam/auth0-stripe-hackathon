import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth0Configured } from '@/lib/auth0';
import { bodyCopy, buttonRow, centeredPageShell, heroPanel, primaryButton } from '@/lib/ui';

type SignInPageProps = {
  searchParams?: Promise<{
    redirect_to?: string | string[];
  }>;
};

function resolveRedirectTarget(value: string | string[] | undefined) {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    // The lens is the product — /dashboard is starter status UI.
    return '/request';
  }

  return value;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  if (!auth0Configured) {
    return (
      <main className={centeredPageShell}>
        <section className={`${heroPanel} w-full`}>
          <h1 className="mb-3 text-3xl font-bold tracking-[-0.03em] text-ink">
            Authentication is not configured yet
          </h1>
          <p className={bodyCopy}>
            Provision Auth0 with Stripe Projects, then pull your env vars into this project.
          </p>
          <div className={`${buttonRow} mt-6`}>
            <Link className={`${primaryButton} max-sm:w-full`} href="/">
              Return home
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const redirectTarget = resolveRedirectTarget(resolvedSearchParams?.redirect_to);

  redirect(`/auth/login?returnTo=${encodeURIComponent(redirectTarget)}`);
}
