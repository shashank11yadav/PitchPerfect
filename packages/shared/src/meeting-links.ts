/**
 * Video call services an interview link may point at, with the hosts their meeting links use.
 * A link on one of these hosts, or on any subdomain of one, is accepted; anything else has to be
 * on the employer's own verified domain (the api checks that part).
 */
const MEETING_SERVICES = [
  { name: "Zoom", hosts: ["zoom.us", "zoom.com", "zoomgov.com"] },
  { name: "Google Meet", hosts: ["meet.google.com"] },
  { name: "Microsoft Teams", hosts: ["teams.microsoft.com", "teams.live.com"] },
  { name: "Webex", hosts: ["webex.com"] },
  { name: "Whereby", hosts: ["whereby.com"] },
  { name: "GoTo Meeting", hosts: ["gotomeeting.com", "meet.goto.com"] },
  { name: "Jitsi Meet", hosts: ["meet.jit.si"] },
  { name: "Amazon Chime", hosts: ["chime.aws"] },
] as const;

/** "Zoom, Google Meet, … or Amazon Chime", for copy that says which links are accepted. */
export const MEETING_SERVICE_NAMES = new Intl.ListFormat("en", { type: "disjunction" }).format(
  MEETING_SERVICES.map((service) => service.name),
);

const MEETING_HOSTS: readonly string[] = MEETING_SERVICES.flatMap((service) => service.hosts);

/**
 * True when `hostname` (as `URL.hostname` gives it: lowercase, punycode) is a meeting host or a
 * subdomain of one. "zoom.us.example" and "notzoom.us" are not; neither is "zoom.us." with its
 * trailing dot.
 */
export function isMeetingServiceHost(hostname: string): boolean {
  return MEETING_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}
