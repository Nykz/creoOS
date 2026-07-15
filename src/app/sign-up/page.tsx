import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getInitialWorkspaceUser } from "@/lib/insforge/current-user";

export default async function SignUpPage() {
  if (await getInitialWorkspaceUser()) redirect("/");
  return <AuthForm mode="sign-up" />;
}
