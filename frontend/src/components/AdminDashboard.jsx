"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminOrdersHref, normalizeOrderStatus } from "../utils/adminOrders.js";
import { useFreshResource } from "../hooks/useFreshResource.js";
import DashboardDataStatus from "./admin/DashboardDataStatus.jsx";
import DashboardPeriodControls from "./admin/DashboardPeriodControls.jsx";
import OperationsOverview from "./admin/OperationsOverview.jsx";
import { normalizeDashboardPeriod } from "../utils/dashboardPeriods.js";
import { fetchAdminDashboard, fetchAdminOperations, fetchOrdersPage, searchAdmin } from "../api/api.js";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = TAB_CONTENT[requestedTab] ? requestedTab : "overview";
  const period = normalizeDashboardPeriod(searchParams.get("period"));
  const recentStatus = normalizeOrderStatus(searchParams.get("recentStatus"));
  const orderStatus = normalizeOrderStatus(searchParams.get("status"));
  const selectedOrderId = searchParams.get("order") || "";
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [orderRefreshKey, setOrderRefreshKey] = useState(0);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const { user, logout, setUser } = useAuth();
  const onUnauthorized = useCallback(error => { if (error.response?.status === 401) setUser(null); }, [setUser]);
  const summary = useFreshResource({ identity: user ? `${user._id}:${user.role}:${period}` : "", fetcher: options => fetchAdminDashboard({ ...options, period }), onUnauthorized });
  const dashboard = summary.data;
  const operations = useFreshResource({ identity: user && activeTab === "overview" ? `${user._id}:${user.role}:operations` : "", fetcher: fetchAdminOperations, onUnauthorized });
  const filteredRecent = useFreshResource({
    identity: user && activeTab === "overview" && recentStatus !== "all" ? `${user._id}:${user.role}:recent:${recentStatus}` : "",
    fetcher: options => fetchOrdersPage({ status: recentStatus, view: "recent" }, options), onUnauthorized,
  });
  const { refresh: refreshSummary } = summary;
  const { refresh: refreshRecent } = filteredRecent;
  const { refresh: refreshOperations } = operations;
  const loadDashboard = useCallback(reason => {
    refreshSummary(reason);
    refreshRecent(reason);
    refreshOperations(reason);
  }, [refreshSummary, refreshRecent, refreshOperations]);
  const recentResource = recentStatus === "all" ? {
    ...summary, data: dashboard ? { data: dashboard.recentOrders, pagination: dashboard.recentOrdersMeta } : null,
  } : filteredRecent;
  const navigate = changes => router.push(adminOrdersHref(searchParams, changes), { scroll: false });

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
    navigate({ tab: nextTab, order: null });
    if (nextTab === "overview") loadDashboard("focus");
    return true;
  };

  const handleLogout = () => {
    if (!confirmSettingsExit()) return;
    summary.stop();
    filteredRecent.stop();
    operations.stop();
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
      {activeTab === "overview" && <DashboardPeriodControls period={period} onChange={value => navigate({ period: value })} resource={summary} />}
      <DashboardDataStatus summary={summary} monitoring={monitoring} settingsHealth={settingsHealth} onRefresh={() => loadDashboard("manual")} onRetryMonitoring={() => pollPendingOrders("manual")} />
      {activeTab === "overview" && (
        <DashboardOverview
          operationalPanel={<OperationsOverview resource={operations} orderHref={(id, attention) => adminOrdersHref(searchParams, { tab: "orders", order: id, ...(attention ? { attention, status: null } : {}) })} />}
          data={dashboard}
          loading={summary.status === "loading"}
          onRefresh={() => loadDashboard("manual")}
          onNavigate={handleTabChange}
          recentResource={recentResource}
          recentStatus={recentStatus}
          onRecentStatusChange={status => navigate({ recentStatus: status })}
          onRecentRefresh={() => recentStatus === "all" ? summary.refresh("manual") : filteredRecent.refresh("manual")}
          viewAllHref={adminOrdersHref(searchParams, { tab: "orders", status: recentStatus, order: null })}
          orderHref={id => adminOrdersHref(searchParams, { tab: "orders", status: recentStatus, order: id })}
        />
      )}
      {activeTab === "orders" && (
        <OrdersTab
          key={`${user?._id}:${searchParams.get("attention") || ""}`}
          onDataChanged={refreshAfterMutation}
          onOrderStatusChanged={handleOrderStatusChanged}
          refreshKey={orderRefreshKey}
          attentionFilter={["pending_age", "preparation_overdue"].includes(searchParams.get("attention")) ? searchParams.get("attention") : ""}
          onClearAttention={() => navigate({ attention: null })}
          statusFilter={orderStatus}
          selectedOrderId={selectedOrderId}
          onStatusFilterChange={status => navigate({ status, order: null, attention: null })}
          onOpenOrder={id => navigate({ tab: "orders", order: id })}
          onCloseOrder={() => navigate({ order: null })}
          onUnauthorized={onUnauthorized}
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
