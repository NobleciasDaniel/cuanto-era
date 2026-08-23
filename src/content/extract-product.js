(() => {
  const currentUrl = String(globalThis.location?.href ?? document.URL ?? "");
  const hostname = (() => {
    try {
      return new URL(currentUrl).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  })();

  const normalizeText = (value) =>
    String(value ?? "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim();

  const text = (...selectors) => {
    for (const selector of selectors.flat()) {
      const value = normalizeText(document.querySelector(selector)?.textContent);
      if (value) return value;
    }
    return "";
  };

  const attribute = (selectors, name) => {
    for (const selector of selectors) {
      const value = normalizeText(document.querySelector(selector)?.getAttribute(name));
      if (value) return value;
    }
    return "";
  };

  const meta = (...keys) => {
    for (const key of keys.flat()) {
      const escaped = globalThis.CSS?.escape ? CSS.escape(key) : key.replace(/["\\]/g, "\\$&");
      const element = document.querySelector(
        `meta[property="${escaped}"], meta[name="${escaped}"], meta[itemprop="${escaped}"]`
      );
      const value = normalizeText(element?.getAttribute("content"));
      if (value) return value;
    }
    return "";
  };

  const first = (...values) => values.flat().find((value) => normalizeText(value)) ?? "";

  const explicitCurrency = (value) => {
    const raw = normalizeText(value).toUpperCase();
    return raw.match(/(?:^|[^A-Z])(MXN|USD|CAD|AUD|EUR|GBP|JPY|INR|BRL|ARS|COP|CLP|PEN)(?=$|[^A-Z])/)?.[1]
      || (raw.includes("MX$") ? "MXN" : "")
      || (raw.includes("US$") ? "USD" : "");
  };

  const parsePrice = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    let raw = String(value ?? "")
      .normalize("NFKC")
      .replace(/[^\d.,-]/g, "")
      .trim();
    if (!raw || raw === "-") return null;
    raw = raw.replace(/-/g, "");
    const lastDot = raw.lastIndexOf(".");
    const lastComma = raw.lastIndexOf(",");
    let normalized = raw;
    if (lastDot >= 0 && lastComma >= 0) {
      const decimal = lastDot > lastComma ? "." : ",";
      const grouping = decimal === "." ? "," : ".";
      normalized = raw.split(grouping).join("").replace(decimal, ".");
    } else {
      const separator = lastDot >= 0 ? "." : lastComma >= 0 ? "," : null;
      if (separator) {
        const parts = raw.split(separator);
        const tail = parts.at(-1) ?? "";
        normalized = tail.length > 0 && tail.length <= 2
          ? `${parts.slice(0, -1).join("")}.${tail}`
          : parts.join("");
      }
    }
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const normalizeUrl = (value) => {
    if (!value) return "";
    try {
      const url = new URL(value, currentUrl);
      url.hash = "";
      for (const key of [...url.searchParams.keys()]) {
        const normalized = key.toLowerCase();
        if (
          normalized.startsWith("utm_") ||
          ["fbclid", "gclid", "msclkid", "ref", "ref_", "tag", "source", "campaign"].includes(normalized)
        ) {
          url.searchParams.delete(key);
        }
      }
      url.searchParams.sort();
      if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
      return url.toString();
    } catch {
      return "";
    }
  };

  const normalizeAvailability = (value) => {
    const normalized = normalizeText(value).replace(/^https?:\/\/schema\.org\//i, "");
    const labels = {
      InStock: "Disponible",
      OutOfStock: "Agotado",
      PreOrder: "Preventa",
      LimitedAvailability: "Disponibilidad limitada"
    };
    return labels[normalized] ?? normalized;
  };

  const typeIncludes = (node, expected) => {
    const values = Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]];
    return values.some((value) => String(value).toLowerCase() === expected.toLowerCase());
  };

  const collectJsonLdNodes = (value, output = []) => {
    if (Array.isArray(value)) {
      value.forEach((item) => collectJsonLdNodes(item, output));
    } else if (value && typeof value === "object") {
      output.push(value);
      if (value["@graph"]) collectJsonLdNodes(value["@graph"], output);
      if (value.mainEntity) collectJsonLdNodes(value.mainEntity, output);
    }
    return output;
  };

  const readJsonLd = () => {
    const nodes = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        collectJsonLdNodes(JSON.parse(script.textContent), nodes);
      } catch {
        // Algunas tiendas publican bloques incompletos; se ignoran individualmente.
      }
    }
    return nodes;
  };

  const imageValue = (value) => {
    if (Array.isArray(value)) return imageValue(value[0]);
    if (value && typeof value === "object") return first(value.url, value.contentUrl);
    return normalizeText(value);
  };

  const imageRectFromElement = (element) => {
    if (!element || typeof element.getBoundingClientRect !== "function") return null;
    const rect = element.getBoundingClientRect();
    const viewportWidth = Number(globalThis.innerWidth) || document.documentElement?.clientWidth || 0;
    const viewportHeight = Number(globalThis.innerHeight) || document.documentElement?.clientHeight || 0;
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(viewportWidth, rect.right);
    const bottom = Math.min(viewportHeight, rect.bottom);
    if (right - left < 24 || bottom - top < 24 || !viewportWidth || !viewportHeight) return null;
    return { left, top, width: right - left, height: bottom - top, viewportWidth, viewportHeight };
  };

  const visibleImageRect = (...selectors) => {
    for (const selector of selectors.flat()) {
      const rect = imageRectFromElement(document.querySelector(selector));
      if (rect) return rect;
    }
    return null;
  };

  const sellerValue = (value) => {
    if (value && typeof value === "object") return first(value.name, value.legalName);
    return normalizeText(value);
  };

  const chooseOffer = (offers) => {
    const candidates = Array.isArray(offers) ? offers : offers ? [offers] : [];
    return candidates.find((offer) => parsePrice(offer?.price ?? offer?.lowPrice) !== null) ?? candidates[0] ?? {};
  };

  const extractStructuredProduct = () => {
    const product = readJsonLd().find((node) => typeIncludes(node, "Product"));
    if (!product) return {};
    const offer = chooseOffer(product.offers);
    const aggregateRating = product.aggregateRating ?? {};
    return {
      title: first(product.name, product.headline),
      image: normalizeUrl(imageValue(product.image)),
      canonicalUrl: normalizeUrl(first(product.url, attribute(['link[rel="canonical"]'], "href"), currentUrl)),
      productId: first(product.sku, product.productID, product.mpn, product.gtin13, product.gtin),
      price: parsePrice(first(offer.price, offer.lowPrice, offer.highPrice)),
      priceText: first(offer.price, offer.lowPrice),
      originalPrice: parsePrice(first(offer.highPrice, offer.priceSpecification?.price)),
      currency: first(offer.priceCurrency, product.offers?.priceCurrency),
      seller: sellerValue(first(offer.seller, product.seller, product.brand)),
      availability: normalizeAvailability(offer.availability),
      shipping: normalizeText(offer.shippingDetails?.shippingRate?.value),
      rating: parsePrice(aggregateRating.ratingValue)
    };
  };

  const extractOpenGraph = () => ({
    title: first(meta("og:title", "twitter:title"), document.title),
    image: normalizeUrl(first(meta("og:image", "twitter:image"))),
    canonicalUrl: normalizeUrl(first(meta("og:url"), attribute(['link[rel="canonical"]'], "href"), currentUrl)),
    productId: first(meta("product:retailer_item_id", "sku")),
    price: parsePrice(first(meta("product:price:amount", "og:price:amount"), attribute(['[itemprop="price"]'], "content"))),
    priceText: first(meta("product:price:amount", "og:price:amount"), text('[itemprop="price"]')),
    currency: first(meta("product:price:currency", "og:price:currency"), attribute(['[itemprop="priceCurrency"]'], "content")),
    availability: normalizeAvailability(first(meta("product:availability"), attribute(['[itemprop="availability"]'], "href"))),
    seller: first(meta("product:brand"), text('[itemprop="seller"]', '[itemprop="brand"]'))
  });

  const selectedVariants = () => {
    const variant = {};
    for (const select of document.querySelectorAll("select")) {
      const option = select.selectedOptions?.[0];
      const key = normalizeText(select.getAttribute("aria-label") || select.name || select.id);
      const value = normalizeText(option?.textContent);
      const isProductOption = Boolean(select.closest(
        '[class*="variation"], [class*="variant"], [id*="variation"], [data-testid*="variant"], [itemprop="offers"]'
      )) || /color|talla|size|capacidad|capacity|estilo|style|modelo|model/i.test(key);
      const isNoise = /cantidad|quantity|provincia|province|pa[ií]s|country|ubicaci[oó]n|location|offline|store|tienda|search|buscar|sort|ordenar|idioma|language/i.test(key);
      if (isProductOption && !isNoise && key && value && key.length <= 48 && value.length <= 96) {
        variant[key] = value;
      }
    }
    for (const selected of document.querySelectorAll('[aria-checked="true"], [aria-selected="true"]')) {
      const container = selected.closest("fieldset, [class*=variation], [class*=variant]");
      const key = normalizeText(container?.querySelector("legend, label")?.textContent || selected.getAttribute("data-name"));
      const value = normalizeText(selected.getAttribute("aria-label") || selected.getAttribute("title") || selected.textContent);
      if (key && value && key !== value && key.length <= 48 && value.length <= 96) variant[key] = value;
    }
    return variant;
  };

  const amazonAdapter = () => {
    const asin = first(
      attribute(["#ASIN"], "value"),
      currentUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1]
    ).toUpperCase();
    const variant = {};
    for (const row of document.querySelectorAll('[id^="variation_"]')) {
      const key = normalizeText(row.querySelector("label")?.textContent).replace(/:$/, "");
      const value = first(
        row.querySelector(".selection")?.textContent,
        row.querySelector('[aria-checked="true"]')?.getAttribute("title"),
        row.querySelector("option:checked")?.textContent
      );
      if (key && value) variant[key] = normalizeText(value);
    }
    let canonicalUrl = normalizeUrl(first(attribute(['link[rel="canonical"]'], "href"), currentUrl));
    if (asin) canonicalUrl = `https://${hostname}/dp/${asin}`;
    const priceText = text(
      "#corePrice_feature_div .a-price .a-offscreen",
      "#apex_desktop .a-price .a-offscreen",
      ".priceToPay .a-offscreen",
      "#priceblock_ourprice",
      "#priceblock_dealprice"
    );
    return {
      store: "amazon",
      adapter: "amazon",
      productId: asin,
      canonicalUrl,
      title: text("#productTitle", "#title"),
      image: normalizeUrl(first(attribute(["#landingImage"], "data-old-hires"), attribute(["#landingImage"], "src"))),
      imageRect: visibleImageRect("#landingImage", "#imgBlkFront"),
      price: parsePrice(priceText),
      priceText,
      originalPrice: parsePrice(text(".basisPrice .a-offscreen", ".a-text-price .a-offscreen")),
      currency: first(explicitCurrency(priceText), meta("priceCurrency")),
      seller: text("#sellerProfileTriggerId", "#merchant-info"),
      availability: text("#availability span", "#outOfStock"),
      shipping: text("#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE", "#deliveryBlockMessage"),
      variant: Object.keys(variant).length ? variant : selectedVariants()
    };
  };

  const mercadoLibreAdapter = () => {
    const productId = first(
      meta("product:retailer_item_id"),
      currentUrl.match(/\b(ML[A-Z]-?\d{6,})\b/i)?.[1]
    ).replace(/-/g, "").toUpperCase();
    const priceText = text(
      ".ui-pdp-price__second-line .andes-money-amount",
      ".ui-pdp-price__main-container .andes-money-amount",
      '[itemprop="offers"] [itemprop="price"]'
    );
    const variant = selectedVariants();
    for (const block of document.querySelectorAll('[class*="ui-pdp-variations"]')) {
      const key = normalizeText(block.querySelector("p, h3, label")?.textContent).replace(/:$/, "");
      const selected = block.querySelector('[aria-checked="true"], .ui-pdp-thumbnail--SELECTED, option:checked');
      const value = normalizeText(selected?.getAttribute("aria-label") || selected?.textContent);
      if (key && value) variant[key] = value;
    }
    return {
      store: "mercado_libre",
      adapter: "mercado_libre",
      productId,
      canonicalUrl: normalizeUrl(first(attribute(['link[rel="canonical"]'], "href"), currentUrl)),
      title: text("h1.ui-pdp-title", "h1"),
      image: normalizeUrl(first(attribute([".ui-pdp-gallery__figure img"], "src"), meta("og:image"))),
      imageRect: visibleImageRect(".ui-pdp-gallery__figure img", ".ui-pdp-image"),
      price: parsePrice(priceText),
      priceText,
      originalPrice: parsePrice(text(".ui-pdp-price__original-value", ".andes-money-amount--previous")),
      currency: first(meta("product:price:currency"), attribute(['[itemprop="priceCurrency"]'], "content")),
      seller: text(".ui-pdp-seller__header__title", ".ui-pdp-seller__link-trigger"),
      availability: text(".ui-pdp-buybox__quantity__available", ".ui-pdp-stock-information"),
      shipping: text(".ui-pdp-media__title", ".ui-pdp-shipping__title"),
      variant
    };
  };

  const genericAdapter = () => {
    const priceText = first(
      text('[itemprop="price"]', '[class*="product-price"]', '[class*="sale-price"]', '[data-testid*="price"]'),
      meta("product:price:amount")
    );
    return {
      store: "generic",
      adapter: "generic",
      canonicalUrl: normalizeUrl(first(attribute(['link[rel="canonical"]'], "href"), currentUrl)),
      title: first(text("h1", '[itemprop="name"]'), meta("og:title"), document.title),
      image: normalizeUrl(first(attribute(['[itemprop="image"]'], "src"), meta("og:image"))),
      imageRect: visibleImageRect('[itemprop="image"]', "main img"),
      productId: first(meta("sku"), attribute(['[itemprop="sku"]'], "content"), text('[itemprop="sku"]')),
      price: parsePrice(priceText),
      priceText,
      originalPrice: parsePrice(text("del", "s", '[class*="original-price"]', '[class*="old-price"]')),
      currency: first(meta("product:price:currency"), attribute(['[itemprop="priceCurrency"]'], "content")),
      seller: text('[itemprop="seller"]', '[class*="seller"]', '[class*="vendor"]'),
      availability: text('[itemprop="availability"]', '[class*="availability"]', '[class*="stock"]'),
      shipping: text('[class*="shipping"]', '[class*="delivery"]'),
      variant: selectedVariants()
    };
  };

  const mergeProducts = (...sources) => {
    const result = {};
    for (const source of sources.reverse()) {
      for (const [key, value] of Object.entries(source ?? {})) {
        if (value !== "" && value !== null && value !== undefined) result[key] = value;
      }
    }
    return result;
  };

  const structured = extractStructuredProduct();
  const openGraph = extractOpenGraph();
  const generic = genericAdapter();
  const specific = hostname === "amazon.com" || hostname.startsWith("amazon.")
    ? amazonAdapter()
    : hostname.includes("mercadolibre.") || hostname.includes("mercadolivre.")
      ? mercadoLibreAdapter()
      : {};
  const product = mergeProducts(specific, structured, openGraph, generic);
  product.domain = hostname;
  product.url = currentUrl;
  product.canonicalUrl = normalizeUrl(first(product.canonicalUrl, currentUrl));
  product.image = normalizeUrl(product.image);
  if (!product.imageRect && product.image) {
    const matchingImage = [...document.querySelectorAll("img")].find((candidate) =>
      normalizeUrl(candidate.currentSrc || candidate.src) === product.image
    );
    product.imageRect = imageRectFromElement(matchingImage);
  }
  product.price = parsePrice(product.price ?? product.priceText);
  product.originalPrice = parsePrice(product.originalPrice);
  product.variant = product.variant && typeof product.variant === "object" ? product.variant : {};

  if (!normalizeText(product.title) || product.price === null) {
    return {
      ok: false,
      error: "No encontramos suficientes datos para identificar un producto y su precio en esta página.",
      diagnostics: {
        domain: hostname,
        hasTitle: Boolean(normalizeText(product.title)),
        hasPrice: product.price !== null,
        structuredProductFound: Boolean(structured.title)
      }
    };
  }

  return {
    ok: true,
    product,
    diagnostics: {
      adapter: product.adapter,
      structuredProductFound: Boolean(structured.title),
      extractedAt: new Date().toISOString()
    }
  };
})();
