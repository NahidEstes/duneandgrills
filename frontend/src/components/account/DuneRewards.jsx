"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clock3,
  Gift,
  History,
  LoaderCircle,
  RefreshCw,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  cancelRewardRedemption,
  fetchRewardAccount,
  fetchRewards,
  redeemReward,
} from "../../api/api.js";
import { useCart } from "../../context/CartContext.jsx";
import SmartImage from "../SmartImage.jsx";

const panelClass =
  "overflow-hidden rounded-[10px] border border-[#2b2b2b] bg-[linear-gradient(135deg,#151515_0%,#0c0c0c_100%)]";

const DuneRewards = ({ compact = false, onBalanceChanged, onOpenCart }) => {
  const { addToCart, removeFromCart } = useCart();
  const [account, setAccount] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [redeemingId, setRedeemingId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rewardList, rewardAccount] = await Promise.all([
        fetchRewards(),
        fetchRewardAccount(),
      ]);
      setRewards(rewardList);
      setAccount(rewardAccount);
      onBalanceChanged?.(rewardAccount.pointsBalance);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "We could not load Dune Rewards right now."
      );
    } finally {
      setLoading(false);
    }
  }, [onBalanceChanged]);

  useEffect(() => {
    load();
  }, [load]);

  const addRedemptionToCart = (redemption, reward) => {
    const lineId = `reward-redemption:${redemption._id}`;
    addToCart({
      _id: lineId,
      menuItem: redemption.menuItem,
      rewardRedemptionId: redemption._id,
      isReward: true,
      name: redemption.title,
      description: "Dune Rewards redemption",
      image: redemption.image || reward?.image || reward?.menuItem?.image || "",
      price: 0,
    });
    onOpenCart?.();
  };

  const handleRedeem = async (reward) => {
    setRedeemingId(reward._id);
    try {
      const result = await redeemReward(reward._id);
      addRedemptionToCart(result.redemption, result.reward);
      toast.success(`${reward.title} was added to your cart.`);
      await load();
    } catch (requestError) {
      toast.error(
        requestError.response?.data?.message || "This reward could not be redeemed."
      );
    } finally {
      setRedeemingId("");
    }
  };

  const handleCancelReservation = async () => {
    const redemption = account?.activeRedemption;
    if (!redemption) return;
    setRedeemingId(redemption._id);
    try {
      await cancelRewardRedemption(redemption._id);
      removeFromCart(`reward-redemption:${redemption._id}`);
      toast.success("Reward removed and your points were returned.");
      await load();
    } catch (requestError) {
      if ([404, 409].includes(requestError.response?.status)) {
        removeFromCart(`reward-redemption:${redemption._id}`);
        toast.info("This reward reservation is no longer active.");
        await load();
        return;
      }
      toast.error(
        requestError.response?.data?.message ||
          "The reward reservation could not be cancelled."
      );
    } finally {
      setRedeemingId("");
    }
  };

  if (loading && !account) {
    return (
      <section className={`${panelClass} grid min-h-52 place-items-center p-6`}>
        <div className="text-center text-sm text-neutral-500">
          <LoaderCircle className="mx-auto mb-3 h-6 w-6 animate-spin text-dune-amber" />
          Loading Dune Rewards…
        </div>
      </section>
    );
  }

  if (error || !account) {
    return (
      <section className={`${panelClass} p-6 text-center`}>
        <p className="text-sm text-red-400">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#414141] px-4 py-2 text-xs text-white hover:border-dune-amber"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Try Again
        </button>
      </section>
    );
  }

  const visibleRewards = compact ? rewards.slice(0, 3) : rewards;

  return (
    <section className={`${panelClass} ${compact ? "p-[18px]" : "p-5 sm:p-6"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-dune-amber">
            Dune Rewards
          </p>
          <h2 className="mt-2 font-display text-3xl tracking-wide text-white sm:text-4xl">
            Your Points
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Earn {account.pointsPerSAR} points for every 1 SAR you spend.
          </p>
        </div>
        <div className="min-w-[180px] rounded-xl border border-dune-amber/35 bg-dune-amber/[0.07] px-5 py-4 sm:text-right">
          <p className="text-xs uppercase tracking-[0.12em] text-neutral-500">
            Current Points
          </p>
          <p className="mt-1 font-display text-4xl text-dune-amber">
            {account.pointsBalance.toLocaleString()}
          </p>
          <p className="text-xs text-neutral-400">Points available</p>
        </div>
      </div>

      {account.activeRedemption && (
        <div className="mt-5 flex flex-col gap-4 rounded-xl border border-sky-500/25 bg-sky-500/[0.06] p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-300">
              <Clock3 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {account.activeRedemption.title} is reserved
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Add it to your order before the reservation expires.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addRedemptionToCart(account.activeRedemption)}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-dune-amber px-4 text-xs font-semibold text-black sm:flex-none"
            >
              <ShoppingBag className="h-4 w-4" /> Add to Cart
            </button>
            <button
              type="button"
              disabled={redeemingId === account.activeRedemption._id}
              onClick={handleCancelReservation}
              className="min-h-10 flex-1 rounded-lg border border-white/10 px-4 text-xs text-neutral-300 hover:border-red-500/40 hover:text-red-300 disabled:opacity-50 sm:flex-none"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold text-white">
          <Gift className="h-4 w-4 text-dune-amber" /> Available Rewards
        </h3>
        {compact && rewards.length > visibleRewards.length && (
          <span className="text-xs text-neutral-500">More rewards available</span>
        )}
      </div>

      {visibleRewards.length ? (
        <div className={`mt-4 grid gap-3 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
          {visibleRewards.map((reward) => {
            const pointsNeeded = Math.max(
              0,
              reward.pointsRequired - account.pointsBalance
            );
            const canRedeem =
              pointsNeeded === 0 &&
              reward.menuItem?.isAvailable !== false &&
              !account.activeRedemption;
            return (
              <article
                key={reward._id}
                className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/25"
              >
                <SmartImage
                  src={reward.image}
                  alt={reward.title}
                  width={640}
                  height={360}
                  sizes="(min-width: 1280px) 300px, (min-width: 640px) 50vw, 100vw"
                  className="h-32 w-full object-cover"
                />
                <div className="p-4">
                  <h4 className="text-sm font-semibold text-white">{reward.title}</h4>
                  <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-neutral-500">
                    {reward.description}
                  </p>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="font-display text-xl text-dune-amber">
                        {reward.pointsRequired.toLocaleString()}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-neutral-600">
                        Points
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!canRedeem || redeemingId === reward._id}
                      onClick={() => handleRedeem(reward)}
                      className="min-h-10 rounded-lg bg-dune-amber px-4 text-xs font-semibold text-black transition hover:bg-dune-amberLight disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-neutral-600"
                    >
                      {redeemingId === reward._id ? "Redeeming…" : "Redeem"}
                    </button>
                  </div>
                  {pointsNeeded > 0 && (
                    <p className="mt-3 text-xs text-amber-400">
                      Need {pointsNeeded.toLocaleString()} more points
                    </p>
                  )}
                  {account.activeRedemption && pointsNeeded === 0 && (
                    <p className="mt-3 text-xs text-sky-300">
                      Complete or cancel your reserved reward first
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 py-10 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-neutral-700" />
          <p className="mt-3 text-sm text-neutral-400">
            No rewards are available right now.
          </p>
          <p className="mt-1 text-xs text-neutral-600">Check back soon.</p>
        </div>
      )}

      {!compact && (
        <div className="mt-7 border-t border-white/[0.08] pt-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <History className="h-4 w-4 text-dune-amber" /> Points History
          </h3>
          {account.history.length ? (
            <div className="mt-4 divide-y divide-white/[0.07] rounded-xl border border-white/[0.08] px-4">
              {account.history.map((transaction) => (
                <div
                  key={transaction._id}
                  className="flex min-h-16 items-center gap-3 py-3"
                >
                  <span
                    className={`font-display text-xl ${
                      transaction.points >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {transaction.points >= 0 ? "+" : ""}
                    {transaction.points.toLocaleString()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">
                      {transaction.description}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
                      {new Date(transaction.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span className="text-right text-xs text-neutral-500">
                    Balance
                    <strong className="mt-1 block font-medium text-neutral-300">
                      {transaction.balanceAfter.toLocaleString()}
                    </strong>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-white/10 py-9 text-center text-sm text-neutral-500">
              You haven&apos;t earned or redeemed any points yet.
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default DuneRewards;
