import { getInitialWorkspaceUser } from "@/lib/insforge/current-user";
import { OnboardingClient } from "./onboarding-client";

export default async function OnboardingPage() {
  const initialUser = await getInitialWorkspaceUser();
  return <OnboardingClient initialUser={initialUser} />;
}
