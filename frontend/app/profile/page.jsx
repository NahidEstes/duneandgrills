import ProfilePage from "@/src/components/ProfilePage.jsx";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";

export const metadata = {
  title: "My Account",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <ProtectedRoute>
      <ProfilePage />
    </ProtectedRoute>
  );
}
