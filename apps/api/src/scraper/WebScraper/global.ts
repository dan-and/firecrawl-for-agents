// Full browser (Hero/Playwright) — needs time for tab launch, JS execution, network idle
export const universalTimeout = 60000;

// Plain HTTP fetch — a server that doesn't respond in 15s won't give useful content
export const fetchTimeout = 15000;