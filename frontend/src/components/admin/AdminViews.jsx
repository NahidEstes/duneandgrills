"use client";

import {
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deleteAdminReview,
  fetchAdminReviews,
} from "../../api/api.js";
import SmartImage from "../SmartImage.jsx";
import {
  formatAdminCurrency,
  formatAdminDate,
} from "./adminUi.js";
import { confirmDelete } from "./deleteToast.js";
import CustomersPage from "./customers/CustomersPage.jsx";
import StaffManagement from "./StaffManagement.jsx";

const CARD =
  "rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.045] to-white/[0.018]";

const LoadingState = ({ label }) => (
  <div className={`${CARD} grid min-h-64 place-items-center text-sm text-neutral-500`}>
    <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin text-dune-amber" /> {label}</span>
  </div>
);

export const CustomersView = () => <CustomersPage />;
export const StaffView = () => <StaffManagement />;

export const ReviewsView = ({ onDataChanged }) => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setReviews(await fetchAdminReviews());
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load reviews.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const removeReview = (review) => confirmDelete({
    title: "Delete this customer review?",
    description: `The ${review.rating}-star review for ${review.menuItem?.name || "this item"} will be permanently removed.`,
    onConfirm: async () => {
      await deleteAdminReview(review._id);
      setReviews((current) => current.filter((entry) => entry._id !== review._id));
      onDataChanged?.();
    },
    successMessage: "Review deleted.",
    errorMessage: "Unable to delete review.",
  });

  if (loading) return <LoadingState label="Loading customer reviews…" />;

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {reviews.map((review) => (
        <article key={review._id} className={`${CARD} p-5`}>
          <div className="flex items-start gap-3">
            {review.user?.avatar ? <SmartImage src={review.user.avatar} alt="" width={72} height={72} sizes="40px" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-dune-amber/10 font-semibold text-dune-amber">{review.user?.name?.charAt(0) || "C"}</span>}
            <div className="min-w-0 flex-1"><p className="font-medium text-white">{review.user?.name || "Customer"}</p><p className="truncate text-xs text-neutral-500">{review.user?.email} · Order #{review.order?.orderNumber}</p></div>
            <button type="button" onClick={() => removeReview(review)} aria-label="Delete review" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-neutral-400 hover:border-red-500/50 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mt-4 flex items-center gap-1">{Array.from({ length: 5 }, (_, index) => <Star key={index} className={`h-4 w-4 ${index < review.rating ? "fill-dune-amber text-dune-amber" : "text-neutral-700"}`} />)}<span className="ml-2 text-xs text-neutral-500">{formatAdminDate(review.createdAt)}</span></div>
          <p className="mt-3 text-sm leading-6 text-neutral-300">“{review.comment}”</p>
          <div className="mt-4 flex items-center gap-3 border-t border-white/[0.07] pt-3">{review.menuItem?.image && <SmartImage src={review.menuItem.image} alt="" width={72} height={72} sizes="32px" className="h-8 w-8 rounded-md object-cover" />}<span className="text-xs text-neutral-500">Reviewed item: <span className="text-neutral-300">{review.menuItem?.name || "Deleted menu item"}</span></span></div>
        </article>
      ))}
      {!reviews.length && <div className={`${CARD} col-span-full py-16 text-center text-sm text-neutral-500`}>No customer reviews yet.</div>}
    </div>
  );
};
