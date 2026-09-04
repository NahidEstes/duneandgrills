import { Suspense } from "react";
import CustomerDisplay from "@/src/components/pos/CustomerDisplay.jsx";

export const metadata = {
  title: "Customer Display",
  robots: { index: false, follow: false },
};

export default function CustomerDisplayPage() {
  return <Suspense fallback={<div className="min-h-dvh bg-[#060807]" />}><CustomerDisplay /></Suspense>;
}
