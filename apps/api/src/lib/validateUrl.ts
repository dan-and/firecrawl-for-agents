export const protocolIncluded = (url: string) => {
  // if :// not in the start of the url assume http (maybe https?)
  // regex checks if :// appears before any .
  return /^([^.:]+:\/\/)/.test(url);
};

const getURLobj = (s: string) => {
  // URL fails if we dont include the protocol ie google.com
  let error = false;
  let urlObj = {};
  try {
    urlObj = new URL(s);
  } catch (err) {
    error = true;
  }
  return { error, urlObj };
};

/**
 * Returns true if the hostname resolves to a private, loopback, or
 * link-local address — i.e. an address that should never be reachable
 * from a legitimate user-supplied URL.
 *
 * Blocks SSRF attacks targeting internal services (Redis, Hero, cloud
 * metadata endpoints, etc.).
 */
export function isInternalHost(hostname: string): boolean {
  if (!hostname) return true;

  const h = hostname.toLowerCase();

  // Block localhost and common Docker-internal service names
  const blockedHostnames = [
    "localhost",
    "redis",
    "worker",
    "playwright-service",
    "api",
  ];
  if (blockedHostnames.includes(h)) return true;

  // Block IPv6 loopback
  if (h === "::1" || h === "[::1]") return true;

  // Parse IPv4 dotted-decimal (ignore non-IP hostnames — those are fine)
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b, c] = ipv4.map(Number);
    return (
      a === 127 ||                        // 127.0.0.0/8  loopback
      a === 10 ||                         // 10.0.0.0/8   RFC 1918
      a === 0 ||                          // 0.0.0.0/8    reserved
      (a === 172 && b >= 16 && b <= 31) || // 172.16–31/12 RFC 1918
      (a === 192 && b === 168) ||         // 192.168.0.0/16 RFC 1918
      (a === 169 && b === 254) ||         // 169.254.0.0/16 link-local / cloud metadata
      (a === 100 && b >= 64 && b <= 127)  // 100.64.0.0/10 carrier-grade NAT
    );
  }

  return false;
}

export const checkAndUpdateURL = (url: string) => {
  if (!protocolIncluded(url)) {
    url = `http://${url}`;
  }

  const { error, urlObj } = getURLobj(url);
  if (error) {
    throw new Error("Invalid URL");
  }

  const typedUrlObj = urlObj as URL;

  if (typedUrlObj.protocol !== "http:" && typedUrlObj.protocol !== "https:") {
    throw new Error("Invalid URL");
  }

  const ssrfEnabled = process.env.SSRF_PROTECTION_ENABLED !== "false";
  if (ssrfEnabled && isInternalHost(typedUrlObj.hostname)) {
    throw new Error("URL hostname is not allowed");
  }

  return { urlObj: typedUrlObj, url: url };
};

export const checkUrl = (url: string) => {
  const { error, urlObj } = getURLobj(url);
  if (error) {
    throw new Error("Invalid URL");
  }

  const typedUrlObj = urlObj as URL;

  if (typedUrlObj.protocol !== "http:" && typedUrlObj.protocol !== "https:") {
    throw new Error("Invalid URL");
  }

  if ((url.split(".")[0].match(/:/g) || []).length !== 1) {
    throw new Error("Invalid URL. Invalid protocol."); // for this one: http://http://example.com
  }

  const ssrfEnabled = process.env.SSRF_PROTECTION_ENABLED !== "false";
  if (ssrfEnabled && isInternalHost(typedUrlObj.hostname)) {
    throw new Error("URL hostname is not allowed");
  }

  return url;
};

/**
 * Same domain check
 * It checks if the domain of the url is the same as the base url
 * It accounts true for subdomains and www.subdomains
 * @param url 
 * @param baseUrl 
 * @returns 
 */
export function isSameDomain(url: string, baseUrl: string) {
  const { urlObj: urlObj1, error: error1 } = getURLobj(url);
  const { urlObj: urlObj2, error: error2 } = getURLobj(baseUrl);

  if (error1 || error2) {
    return false;
  }

  const typedUrlObj1 = urlObj1 as URL;
  const typedUrlObj2 = urlObj2 as URL;

  const cleanHostname = (hostname: string) => {
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  };

  const domain1 = cleanHostname(typedUrlObj1.hostname).split('.').slice(-2).join('.');
  const domain2 = cleanHostname(typedUrlObj2.hostname).split('.').slice(-2).join('.');

  return domain1 === domain2;
}


export function isSameSubdomain(url: string, baseUrl: string) {
  const { urlObj: urlObj1, error: error1 } = getURLobj(url);
  const { urlObj: urlObj2, error: error2 } = getURLobj(baseUrl);

  if (error1 || error2) {
    return false;
  }

  const typedUrlObj1 = urlObj1 as URL;
  const typedUrlObj2 = urlObj2 as URL;

  const cleanHostname = (hostname: string) => {
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  };

  const domain1 = cleanHostname(typedUrlObj1.hostname).split('.').slice(-2).join('.');
  const domain2 = cleanHostname(typedUrlObj2.hostname).split('.').slice(-2).join('.');

  const subdomain1 = cleanHostname(typedUrlObj1.hostname).split('.').slice(0, -2).join('.');
  const subdomain2 = cleanHostname(typedUrlObj2.hostname).split('.').slice(0, -2).join('.');

  // Check if the domains are the same and the subdomains are the same
  return domain1 === domain2 && subdomain1 === subdomain2;
}


export const checkAndUpdateURLForMap = (url: string) => {
  if (!protocolIncluded(url)) {
    url = `http://${url}`;
  }
  // remove last slash if present
  if (url.endsWith("/")) {
    url = url.slice(0, -1);
  }


  const { error, urlObj } = getURLobj(url);
  if (error) {
    throw new Error("Invalid URL");
  }

  const typedUrlObj = urlObj as URL;

  if (typedUrlObj.protocol !== "http:" && typedUrlObj.protocol !== "https:") {
    throw new Error("Invalid URL");
  }

  const ssrfEnabled = process.env.SSRF_PROTECTION_ENABLED !== "false";
  if (ssrfEnabled && isInternalHost(typedUrlObj.hostname)) {
    throw new Error("URL hostname is not allowed");
  }

  // remove any query params
  url = url.split("?")[0].trim();

  return { urlObj: typedUrlObj, url: url };
};





export function removeDuplicateUrls(urls: string[]): string[] {
  const urlMap = new Map<string, string>();

  for (const url of urls) {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol;
    const hostname = parsedUrl.hostname.replace(/^www\./, '');
    const path = parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
    
    const key = `${hostname}${path}`;
    
    if (!urlMap.has(key)) {
      urlMap.set(key, url);
    } else {
      const existingUrl = new URL(urlMap.get(key)!);
      const existingProtocol = existingUrl.protocol;
      
      if (protocol === 'https:' && existingProtocol === 'http:') {
        urlMap.set(key, url);
      } else if (protocol === existingProtocol && !parsedUrl.hostname.startsWith('www.') && existingUrl.hostname.startsWith('www.')) {
        urlMap.set(key, url);
      }
    }
  }

  return [...new Set(Array.from(urlMap.values()))];
}