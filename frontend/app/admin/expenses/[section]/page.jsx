import { notFound } from "next/navigation";
import FinanceExpensesPage from "@/src/components/admin/finance/FinanceExpensesPage.jsx";

const sections = new Set(["entries", "recurring", "categories", "reports"]);

export default async function ExpensesSectionPage({ params }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return <FinanceExpensesPage section={section} />;
}
