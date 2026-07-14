import "server-only";

function required(name: "INSFORGE_URL" | "INSFORGE_API_KEY"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export const env = {
  insforgeUrl: () => required("INSFORGE_URL"),
  insforgeApiKey: () => required("INSFORGE_API_KEY"),
};
