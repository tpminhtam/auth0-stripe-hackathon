import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

export function getPostHogClient() {
  if (!posthogClient) {
    posthogClient = new PostHog(posthogToken || 'phc_disabled', {
      host: 'https://us.posthog.com',
      flushAt: 1,
      flushInterval: 0,
      disabled: !posthogToken,
    });
  }

  return posthogClient;
}

export async function shutdownPostHog() {
  if (posthogClient) {
    await posthogClient.shutdown();
  }
}
