import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getInitialWorkspaceUser } from "@/lib/insforge/current-user";

function safeNextPath(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default async function SignInPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  if (await getInitialWorkspaceUser()) redirect("/");
  const params = searchParams ? await searchParams : {};
  return <AuthForm mode="sign-in" nextPath={safeNextPath(params.next)} />;
}
