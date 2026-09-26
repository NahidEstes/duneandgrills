"use client";

import { CircleCheckBig, CircleX, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { Toaster } from "sonner";

const iconClass = "h-[1.125rem] w-[1.125rem]";

export default function DuneToaster() {
  return (
    <Toaster
      className="dune-toaster"
      position="top-right"
      theme="dark"
      closeButton
      gap={10}
      offset={{ top: "calc(env(safe-area-inset-top, 0px) + 5.75rem)", right: "1.25rem" }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top, 0px) + 4.75rem)", right: "0.75rem", left: "0.75rem" }}
      icons={{
        success: <CircleCheckBig className={iconClass} />,
        error: <CircleX className={iconClass} />,
        warning: <TriangleAlert className={iconClass} />,
        info: <Info className={iconClass} />,
        loading: <LoaderCircle className={`${iconClass} animate-spin`} />,
        close: <X className="h-3.5 w-3.5" />,
      }}
      toastOptions={{
        classNames: {
          toast: "dune-toast",
          title: "dune-toast-title",
          description: "dune-toast-description",
          content: "dune-toast-content",
          icon: "dune-toast-icon",
          closeButton: "dune-toast-close",
          actionButton: "dune-toast-action",
          cancelButton: "dune-toast-cancel",
          loader: "dune-toast-loader",
        },
      }}
    />
  );
}
