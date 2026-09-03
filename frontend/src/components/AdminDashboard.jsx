"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchAdminDashboard, searchAdmin } from "../api/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useAdminOrderAlerts } from "../hooks/useAdminOrderAlerts.js";
import AdminShell from "./admin/AdminShell.jsx";
import DashboardOverview from "./admin/DashboardOverview.jsx";
import MenuItemsTab from "./admin/MenuItemsTab.jsx";
import CombosTab from "./admin/CombosTab.jsx";
import CategoriesTab from "./admin/CategoriesTab.jsx";
import RewardsTab from "./admin/RewardsTab.jsx";
import PosTab from "./admin/pos/PosTab.jsx";
import {
  AnalyticsView,
  CustomersView,
  ReviewsView,
  SettingsView,
  StaffView,
} from "./admin/AdminViews.jsx";
import BlogTab from "./BlogTab.jsx";
import OffersTab from "./OffersTab.jsx";
import OrdersTab from "./OrdersTab.jsx";

const TAB_CONTENT = {
  overview: {
    title: "Restaurant Dashboard",
    subtitle: "A live overview of orders, content and restaurant performance.",
  },
  pos: {
    title: "POS / New Sale",
    subtitle: "Create a fast, secure in-person sale using the live menu catalog.",
  },
  orders: {
    title: "Order Management",
    subtitle: "Track customer orders and update each stage of fulfilment.",
  },
  menu: {
    title: "Menu Items",
    subtitle: "Manage dishes, pricing, categories and public availability.",
  },
  combos: {
    title: "Combo Packages",
    subtitle: "Build and publish value packages from existing menu items.",
  },
  categories: {
    title: "Categories",
    subtitle: "Organize and manage both menu and blog categories.",
  },
  customers: {
    title: "Customers",
    subtitle: "View safe account details, order counts and points balances.",
  },
  offers: {
    title: "Offers & Promotions",
    subtitle: "Manage the same promotions displayed in Exclusive Offers.",
  },
  rewards: {
    title: "Dune Rewards",
    subtitle: "Manage point-based rewards independently from promotional offers.",
  },
  blog: {
    title: "Blog / Content Control",
    subtitle: "Create, edit, publish and remove restaurant stories.",
  },
  reviews: {
    title: "Customer Reviews",
    subtitle: "Read and moderate verified reviews from delivered orders.",
  },
  analytics: {
    title: "Restaurant Analytics",
    subtitle: "Revenue, order status and menu performance from live records.",
  },
  staff: {
    title: "Staff Accounts",
    subtitle: "View the admin and manager accounts authorized for this dashboard.",
  },
  settings: {
    title: "Dashboard Settings",
    subtitle: "Review the operational configuration already used by the project.",
  },
};

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [orderRefreshKey, setOrderRefreshKey] = useState(0);
  const { user, logout } = useAuth();

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setDashboard(await fetchAdminDashboard());
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to load the admin dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handlePendingOrdersChange = useCallback(() => {
    setOrderRefreshKey((current) => current + 1);
    loadDashboard(true);
  }, [loadDashboard]);

  const {
    alertsEnabled,
    dismissPendingOrder,
    pendingCount,
    pollPendingOrders,
    requestBrowserPermission,
    toggleAlerts,
  } = useAdminOrderAlerts({
    onPendingOrdersChange: handlePendingOrdersChange,
  });

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }

    let active = true;
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const results = await searchAdmin(query);
        if (active) setSearchResults(results);
      } catch {
        if (active) setSearchResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [searchQuery]);

  const handleLogout = () => {
    logout();
  };

  const handleOrderStatusChanged = (orderId, status) => {
    if (status === "pending") {
      pollPendingOrders();
    } else {
      dismissPendingOrder(orderId);
    }
    setOrderRefreshKey((current) => current + 1);
  };

  const content = TAB_CONTENT[activeTab] || TAB_CONTENT.overview;
  const refreshAfterMutation = () => loadDashboard(true);

  return (
    <AdminShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      title={content.title}
      subtitle={content.subtitle}
      user={user}
      onLogout={handleLogout}
      dashboard={dashboard}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchResults={searchResults}
      searching={searching}
      pendingOrderCount={pendingCount}
      orderAlertsEnabled={alertsEnabled}
      onEnableOrderAlerts={requestBrowserPermission}
      onToggleOrderAlerts={toggleAlerts}
    >
      {activeTab === "overview" && (
        <DashboardOverview
          data={dashboard}
          loading={loading}
          onRefresh={() => loadDashboard()}
          onNavigate={setActiveTab}
        />
      )}
      {activeTab === "orders" && (
        <OrdersTab
          onDataChanged={refreshAfterMutation}
          onOrderStatusChanged={handleOrderStatusChanged}
          refreshKey={orderRefreshKey}
        />
      )}
      {activeTab === "pos" && (
        <PosTab
          onSaleCompleted={() => {
            setOrderRefreshKey((current) => current + 1);
            loadDashboard(true);
          }}
        />
      )}
      {activeTab === "menu" && (
        <MenuItemsTab onDataChanged={refreshAfterMutation} />
      )}
      {activeTab === "combos" && (
        <CombosTab onDataChanged={refreshAfterMutation} />
      )}
      {activeTab === "categories" && (
        <CategoriesTab onDataChanged={refreshAfterMutation} />
      )}
      {activeTab === "customers" && <CustomersView />}
      {activeTab === "offers" && (
        <OffersTab onDataChanged={refreshAfterMutation} />
      )}
      {activeTab === "rewards" && (
        <RewardsTab onDataChanged={refreshAfterMutation} />
      )}
      {activeTab === "blog" && (
        <BlogTab onDataChanged={refreshAfterMutation} />
      )}
      {activeTab === "reviews" && (
        <ReviewsView onDataChanged={refreshAfterMutation} />
      )}
      {activeTab === "analytics" && <AnalyticsView dashboard={dashboard} />}
      {activeTab === "staff" && <StaffView />}
      {activeTab === "settings" && <SettingsView dashboard={dashboard} />}
    </AdminShell>
  );
};

export default AdminDashboard;
