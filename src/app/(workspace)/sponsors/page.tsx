import { ModulePage } from "@/components/module-page";
import { WorkspaceRoleGate } from "@/components/workspace-role-gate";
export default function SponsorsPage() { return <WorkspaceRoleGate><ModulePage title="Sponsors" description="Keep partner relationships, deliverables, and revenue organized." action="New sponsor" resource="sponsors" /></WorkspaceRoleGate>; }
