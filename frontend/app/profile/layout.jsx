import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import ProfilePage from "@/src/components/ProfilePage.jsx";

export const metadata = {
  title: "My Account",
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }) {
  return (
    <ProtectedRoute>
      <ProfilePage />
      {children}
    </ProtectedRoute>
  );
}
