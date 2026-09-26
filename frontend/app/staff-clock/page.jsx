import StaffClockPage from "@/src/components/staff-clock/StaffClockPage.jsx";

export const metadata = { title: "Staff Clock", robots: { index: false, follow: false } };

export default function StaffClockRoute() {
  return <StaffClockPage />;
}
