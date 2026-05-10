const REQUIRED = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "DATABASE_URL"] as const;

for (const key of REQUIRED) {
  if (!process.env[key]) {
    throw new Error(`[env] Missing required environment variable: ${key}`);
  }
}

if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
  throw new Error("[env] JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must not be the same value");
}

export const env = {
  JWT_ACCESS_SECRET:  process.env.JWT_ACCESS_SECRET!,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
  DATABASE_URL:       process.env.DATABASE_URL!,
};
