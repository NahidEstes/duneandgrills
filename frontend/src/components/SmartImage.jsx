import Image from "next/image";

const canOptimize = (src) => {
  if (typeof src !== "string") return true;
  if (src.startsWith("/")) return true;

  try {
    return new URL(src).hostname === "images.unsplash.com";
  } catch {
    return false;
  }
};

const SmartImage = ({
  src,
  alt,
  className = "",
  width = 800,
  height = 600,
  sizes = "100vw",
  priority = false,
  fill = false,
  loading,
  ...props
}) => {
  if (!src) return null;

  if (!canOptimize(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={`${fill ? "absolute inset-0" : ""} ${className}`}
        loading={priority ? "eager" : loading || "lazy"}
        {...props}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      className={className}
      sizes={sizes}
      priority={priority}
      loading={priority ? undefined : loading}
      {...(fill ? { fill: true } : { width, height })}
      {...props}
    />
  );
};

export default SmartImage;
