const LOCAL_IMAGE_PATTERN = /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i;
const MAX_IMAGE_LENGTH = 100_000;

export function normalizeLocalProductImage(value) {
  const image = typeof value === "string" ? value.trim() : "";
  if (!image || image.length > MAX_IMAGE_LENGTH || !LOCAL_IMAGE_PATTERN.test(image)) return "";
  return image;
}

export function isLocalProductImage(value) {
  return normalizeLocalProductImage(value) !== "";
}
