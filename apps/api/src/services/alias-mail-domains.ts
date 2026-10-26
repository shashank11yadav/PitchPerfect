/**
 * Mail domains where anyone can get an address that forwards to another mailbox, or a free private
 * mailbox, that `email-providers` and `disposable-email-domains-js` leave out. An address on one of
 * them proves nothing about the company that owns the domain. Lowercase; subdomains are covered by
 * the check in `company-verification.ts`.
 *
 * Sources, each the provider's own documentation of the domains it hands out addresses on:
 * DuckDuckGo Email Protection (duck.com), Firefox Relay (mozmail.com), Fastmail and its masked
 * email (fastmail.*, messagingengine.com), Tuta (tutanota.*, tuta.*, tutamail.com, keemail.me),
 * Proton and Proton Pass aliases (pm.me, proton.me, protonmail.*, passmail.*, passinbox.com),
 * SimpleLogin (simplelogin.*, slmail.me, aleeas.com and its other shared alias domains), addy.io,
 * formerly AnonAddy (anonaddy.*, addy.io, addymail.com), iCloud Hide My Email
 * (privaterelay.appleid.com, icloud.com, me.com, mac.com), HEY (hey.com), 33mail (33mail.com),
 * Forward Email (forwardemail.net) and Mailfence, Posteo, StartMail and mailbox.org.
 */
export const ALIAS_MAIL_DOMAINS: readonly string[] = [
  "duck.com",
  "mozmail.com",
  "relay.firefox.com",
  "fastmail.com",
  "fastmail.fm",
  "fastmail.net",
  "fastmail.org",
  "fastmail.us",
  "messagingengine.com",
  "tutanota.com",
  "tutanota.de",
  "tutamail.com",
  "tuta.io",
  "tuta.com",
  "keemail.me",
  "pm.me",
  "proton.me",
  "protonmail.com",
  "protonmail.ch",
  "passmail.net",
  "passmail.com",
  "passinbox.com",
  "simplelogin.com",
  "simplelogin.co",
  "simplelogin.fr",
  "slmail.me",
  "aleeas.com",
  "8alias.com",
  "8shield.net",
  "dralias.com",
  "silomails.com",
  "anonaddy.com",
  "anonaddy.me",
  "addy.io",
  "addymail.com",
  "privaterelay.appleid.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "hey.com",
  "33mail.com",
  "forwardemail.net",
  "mailfence.com",
  "posteo.de",
  "posteo.net",
  "startmail.com",
  "mailbox.org",
];
