export type KnowledgeContactDetails = {
  phones: string[];
  addresses: string[];
  websites: string[];
};

function uniqueValues(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase("vi-VN").replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanValue(value: string, maxLength: number) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s:：|,;.\-–—]+|[\s|,;]+$/g, "")
    .trim()
    .slice(0, maxLength);
}

export function extractKnowledgeContactDetails(text: string): KnowledgeContactDetails {
  const phones: string[] = [];
  const addresses: string[] = [];
  const websites: string[] = [];

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const phoneMatch = line.match(
      /(?:hotline|số\s*điện\s*thoại|điện\s*thoại|phone|telephone|tel|liên\s*hệ)\s*(?:[:：\-–—]\s*)?(\+?\d[\d(). \t-]{7,}\d)/iu
    );
    if (phoneMatch?.[1]) {
      phones.push(cleanValue(phoneMatch[1], 40));
    }

    const addressMatch = line.match(
      /(?:địa\s*chỉ|address|trụ\s*sở|văn\s*phòng)\s*(?:[:：\-–—]\s*)(.+)$/iu
    );
    if (addressMatch?.[1]) {
      const address = addressMatch[1].split(/\s+[|•]\s+/u)[0];
      addresses.push(cleanValue(address, 240));
    }

    const websiteMatch = line.match(
      /(?:website|trang\s*web|web)\s*(?:[:：\-–—]\s*)((?:https?:\/\/|www\.)[^\s|,;]+)/iu
    );
    if (websiteMatch?.[1]) {
      websites.push(cleanValue(websiteMatch[1], 200));
    }
  }

  return {
    phones: uniqueValues(phones),
    addresses: uniqueValues(addresses),
    websites: uniqueValues(websites),
  };
}

export function mergePageContactDetails(
  pageSpecific: KnowledgeContactDetails,
  shared: KnowledgeContactDetails
): KnowledgeContactDetails {
  return {
    phones: pageSpecific.phones.length > 0 ? pageSpecific.phones : shared.phones,
    addresses: pageSpecific.addresses.length > 0 ? pageSpecific.addresses : shared.addresses,
    websites: pageSpecific.websites.length > 0 ? pageSpecific.websites : shared.websites,
  };
}

export function formatKnowledgeContactContext(details: KnowledgeContactDetails) {
  return [
    ...details.phones.map((value) => `Hotline: ${value}`),
    ...details.addresses.map((value) => `Địa chỉ: ${value}`),
    ...details.websites.map((value) => `Website: ${value}`),
  ].join("\n");
}

export function ensureKnowledgeContactFooter(bodyText: string, researchContext: string) {
  const marker = "KHO LIÊN HỆ HIỆU LỰC";
  const markerIndex = researchContext.lastIndexOf(marker);
  if (markerIndex < 0) return bodyText.trim();

  const details = extractKnowledgeContactDetails(researchContext.slice(markerIndex + marker.length));
  const footer = formatKnowledgeContactContext(details);
  if (!footer) return bodyText.trim();

  const body = bodyText.trim();
  const tail = body.slice(-600).toLocaleLowerCase("vi-VN");
  const missingLines = footer.split("\n").filter((line) => {
    const value = line.slice(line.indexOf(":") + 1).trim().toLocaleLowerCase("vi-VN");
    return value && !tail.includes(value);
  });

  return missingLines.length > 0
    ? `${body}\n\n${missingLines.map((line) => {
        if (line.startsWith("Hotline:")) return `☎️ ${line}`;
        if (line.startsWith("Địa chỉ:")) return `📍 ${line}`;
        return `🌐 ${line}`;
      }).join("\n")}`
    : body;
}
