"use client";

import { useCallback, useEffect, useState } from "react";
import { useFreshResource } from "../hooks/useFreshResource.js";
import DashboardDataStatus from "./admin/DashboardDataStatus.jsx";
import { fetchAdminDashboard, searchAdmin } from "../api/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useAdminOrderAlerts } from "../hooks/useAdminOrderAlerts.js";
import { RESTAURANT_SETTINGS_UPDATED_EVENT } from "../utils/notificationSettings.js";
import AdminShell from "./admin/AdminShell.jsx";
import DashboardOverview from "./admin/DashboardOverview.jsx";
import MenuItemsTab from "./admin/MenuItemsTab.jsx";
import CombosTab from "./admin/CombosTab.jsx";
import CategoriesTab from "./admin/CategoriesTab.jsx";
import RewardsTab from "./admin/RewardsTab.jsx";
import {
  CustomersView,
  ReviewsView,
  StaffView,
} from "./admin/AdminViews.jsx";
import RestaurantSettingsPage from "./admin/settings/RestaurantSettingsPage.jsx";
import AnalyticsView from "./admin/AnalyticsView.jsx";
import AuditLogView from "./admin/AuditLogView.jsx";
import BlogTab from "./BlogTab.jsx";
import OffersTab from "./OffersTab.jsx";
import OrdersTab from "./OrdersTab.jsx";

const TAB_CONTENT = {
  overview: {
    title: "Restaurant Dashboard",
    subtitle: "Orders, content and restaurant performance with explicit update status.",
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
    subtitle: "Revenue, order status and menu performance from recorded orders.",
  },
  audit: {
    title: "Admin Audit Log",
    subtitle: "Permanent history of operational and administrative changes.",
  },
  staff: {
    title: "Staff Accounts",
    subtitle: "View the admin, manager and kitchen staff accounts used by restaurant operations.",
  },
  settings: {
    title: "Restaurant Settings",
    subtitle: "Manage business hours, ordering, notifications, receipts and restaurant contact details.",
  },
};

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [orderRefreshKey, setOrderRefreshKey] = useState(0);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const { user, logout, setUser } = useAuth();
  const onUnauthorized = useCallback(error => { if (error.response?.status === 401) setUser(null); }, [setUser]);
  const summary = useFreshResource({ identity: user ? `${user._id}:${user.role}` : "", fetcher: fetchAdminDashboard, onUnauthorized });
  const dashboard = summary.data;
  const loadDashboard = summary.refresh;

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (requestedTab && TAB_CONTENT[requestedTab]) setActiveTab(requestedTab);
  }, []);

  useEffect(() => {
    const refreshSettingsSummary = () => loadDashboard("mutation");
    window.addEventListener(RESTAURANT_SETTINGS_UPDATED_EVENT, refreshSettingsSummary);
    return () => window.removeEventListener(RESTAURANT_SETTINGS_UPDATED_EVENT, refreshSettingsSummary);
  }, [loadDashboard]);

  const handlePendingOrdersChange = useCallback((_orders, { initial = false } = {}) => {
    setOrderRefreshKey((current) => current + 1);
    if (!initial) loadDashboard("mutation");
  }, [loadDashboard]);

  const {
    alertsEnabled,
    dismissPendingOrder,
    pendingCount,
    pollPendingOrders,
    requestBrowserPermission,
    toggleAlerts,
    monitoring,
    settingsHealth,
    stopMonitoring,
  } = useAdminOrderAlerts({
    onPendingOrdersChange: handlePendingOrdersChange,
    onUnauthorized,
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

  const confirmSettingsExit = () => activeTab !== "settings" || !settingsDirty || window.confirm("Discard unsaved Restaurant Settings changes?");
  const handleTabChange = (nextTab) => {
    if (!confirmSettingsExit()) return false;
    setActiveTab(nextTab);
    if (nextTab === "overview") loadDashboard("focus");
    return true;
  };

  const handleLogout = () => {
    if (!confirmSettingsExit()) return;
    summary.stop();
    stopMonitoring();
    logout();
  };

  const handleOrderStatusChanged = (orderId, status) => {
    if (status === "pending") {
      pollPendingOrders();
    } else {
      dismissPendingOrder(orderId);
    }
    setOrderRefreshKey((current) => current + 1);
    loadDashboard("mutation");
  };

  const content = TAB_CONTENT[activeTab] || TAB_CONTENT.overview;
  const refreshAfterMutation = () => loadDashboard("mutation");

  return (
    <AdminShell
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onNavigateAway={confirmSettingsExit}
      title={content.title}
      subtitle={content.subtitle}
      user={user}
      onLogout={handleLogout}
      dashboard={dashboard}
      dataStatus={summary.status}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchResults={searchResults}
      searching={searching}
      pendingOrderCount={pendingCount}
      orderAlertsEnabled={alertsEnabled}
      onEnableOrderAlerts={requestBrowserPermission}
      onToggleOrderAlerts={toggleAlerts}
    >
      <DashboardDataStatus summary={summary} monitoring={monitoring} settingsHealth={settingsHealth} onRefresh={() => loadDashboard("manual")} onRetryMonitoring={() => pollPendingOrders("manual")} />
      {activeTab === "overview" && (
        <DashboardOverview
          data={dashboard}
          loading={summary.status === "loading"}
          onRefresh={() => loadDashboard("manual")}
          onNavigate={handleTabChange}
        />
      )}
      {activeTab === "orders" && (
        <OrdersTab
          onDataChanged={refreshAfterMutation}
          onOrderStatusChanged={handleOrderStatusChanged}
          refreshKey={orderRefreshKey}
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
      {activeTab === "analytics" && <AnalyticsView />}
      {activeTab === "audit" && <AuditLogView />}
      {activeTab === "staff" && <StaffView />}
      {activeTab === "settings" && <RestaurantSettingsPage onDirtyChange={setSettingsDirty} />}
    </AdminShell>
  );
};

export default AdminDashboard;
