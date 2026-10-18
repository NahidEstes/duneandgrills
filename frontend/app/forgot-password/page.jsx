import CustomerAccountAccess from "@/src/components/account/CustomerAccountAccess.jsx";
export const metadata = { title: "Customer account", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Page() { return <CustomerAccountAccess mode="forgot" />; }
