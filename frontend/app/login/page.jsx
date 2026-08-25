import AuthPage from "@/src/components/AuthPage.jsx";

export const metadata = {
  title: "Log In",
  description: "Log in or create a Dune & Grills customer account.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <AuthPage />;
}
