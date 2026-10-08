export const AI_CRAWLERS = [
  { robotsName: "GPTBot", userAgents: ["GPTBot"] },
  { robotsName: "ChatGPT-User", userAgents: ["ChatGPT-User"] },
  { robotsName: "OAI-SearchBot", userAgents: ["OAI-SearchBot"] },
  { robotsName: "ClaudeBot", userAgents: ["ClaudeBot"] },
  { robotsName: "Claude-Web", userAgents: ["Claude-Web"] },
  { robotsName: "anthropic-ai", userAgents: ["anthropic-ai"] },
  { robotsName: "Google-Extended", userAgents: ["Google-Extended"] },
  { robotsName: "CCBot", userAgents: ["CCBot"] },
  { robotsName: "PerplexityBot", userAgents: ["PerplexityBot"] },
  { robotsName: "Perplexity-User", userAgents: ["Perplexity-User"] },
  { robotsName: "Bytespider", userAgents: ["Bytespider"] },
  { robotsName: "Amazonbot", userAgents: ["Amazonbot"] },
  { robotsName: "Applebot-Extended", userAgents: ["Applebot-Extended"] },
  { robotsName: "Meta-ExternalAgent", userAgents: ["Meta-ExternalAgent"] },
  { robotsName: "cohere-ai", userAgents: ["cohere-ai"] },
  { robotsName: "YouBot", userAgents: ["YouBot"] },
] as const;

const robotPattern = /(?:bot\b|crawler|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|curl\/|wget\/|python-requests|go-http-client)/i;

export function findAiCrawler(userAgent: string) {
  return AI_CRAWLERS.find((crawler) => crawler.userAgents.some((token) => userAgent.toLowerCase().includes(token.toLowerCase()))) ?? null;
}

export function isKnownRobot(userAgent: string) {
  return !userAgent.trim() || Boolean(findAiCrawler(userAgent)) || robotPattern.test(userAgent);
}
