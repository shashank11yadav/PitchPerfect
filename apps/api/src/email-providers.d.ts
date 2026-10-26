// `email-providers` ships no types: its default export is its `all.json`, lowercase domains.
declare module "email-providers" {
  const domains: string[];
  export default domains;
}
