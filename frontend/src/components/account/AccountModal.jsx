"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

const AccountModal = ({ title, description, onClose, children, maxWidth = "max-w-lg" }) => {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      role="presentation"
      onMouseDown={onClose}
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
        className={`my-8 w-full ${maxWidth} rounded-2xl border border-dune-border bg-[#111] p-6 shadow-2xl`}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 id="account-modal-title" className="font-display text-2xl tracking-wide text-white">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-neutral-400">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dune-border text-neutral-400 hover:border-dune-amber hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default AccountModal;

