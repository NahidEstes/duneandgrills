import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import OperationsKnowledgeBase from "@/src/components/knowledge/OperationsKnowledgeBase.jsx";
import { KNOWLEDGE_BASE_ROLES } from "@/src/components/knowledge/knowledgePermissions.js";

export const metadata = {
  title: "Operations Knowledge Base",
  robots: { index: false, follow: false },
};

export default function TipsAndTricksPage() {
  return <ProtectedRoute roles={KNOWLEDGE_BASE_ROLES}><OperationsKnowledgeBase /></ProtectedRoute>;
}
