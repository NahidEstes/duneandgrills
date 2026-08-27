import { revalidatePath } from "next/cache";

const INVALIDATION_PATHS = {
  menu: [
    ["/", "page"],
    ["/menu", "page"],
    ["/blog", "page"],
    ["/blog/[slug]", "page"],
  ],
  blog: [
    ["/", "page"],
    ["/blog", "page"],
    ["/blog/[slug]", "page"],
    ["/sitemap.xml"],
  ],
  orders: [
    ["/admin", "page"],
    ["/profile", "page"],
  ],
  offers: [["/", "page"]],
};

export const invalidateContent = (contentType) => {
  const paths = INVALIDATION_PATHS[contentType] || [];

  paths.forEach(([path, type]) => {
    if (type) {
      revalidatePath(path, type);
    } else {
      revalidatePath(path);
    }
  });
};
