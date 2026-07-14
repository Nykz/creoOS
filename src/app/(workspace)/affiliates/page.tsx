import { ModulePage } from "@/components/module-page";
import { WorkspaceRoleGate } from "@/components/workspace-role-gate";
export default function AffiliatesPage() { return <WorkspaceRoleGate><ModulePage title="Affiliates" description="Track partner links, payouts, conversion performance, and opportunities." action="New affiliate" resource="affiliates" /></WorkspaceRoleGate>; }
