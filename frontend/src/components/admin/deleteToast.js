import { toast } from "sonner";

export const confirmDelete = ({
  title,
  description = "This action cannot be undone.",
  onConfirm,
  successMessage,
  errorMessage,
}) => {
  const toastId = toast.warning(title, {
    description,
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Delete",
      onClick: async () => {
        toast.loading("Deleting…", { id: toastId });
        try {
          await onConfirm();
          toast.success(successMessage || "Deleted successfully.", {
            id: toastId,
          });
        } catch (error) {
          toast.error(
            error?.response?.data?.message || errorMessage || "Delete failed.",
            { id: toastId }
          );
        }
      },
    },
    cancel: {
      label: "Cancel",
      onClick: () => toast.dismiss(toastId),
    },
  });
};
