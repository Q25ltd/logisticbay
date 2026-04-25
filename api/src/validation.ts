export function validateLogin(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!body.email    || typeof body.email    !== "string") errors.push("email is required");
  if (!body.password || typeof body.password !== "string") errors.push("password is required");
  return { valid: errors.length === 0, errors };
}

export function validateCompanyRegister(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!body.name     || typeof body.name     !== "string") errors.push("name is required");
  if (!body.email    || typeof body.email    !== "string") errors.push("email is required");
  if (!body.password || typeof body.password !== "string") errors.push("password is required");
  if (typeof body.password === "string" && body.password.length < 8) errors.push("password must be at least 8 characters");
  return { valid: errors.length === 0, errors };
}

export function validateCreateDriver(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!body.name     || typeof body.name     !== "string") errors.push("name is required");
  if (!body.email    || typeof body.email    !== "string") errors.push("email is required");
  if (!body.password || typeof body.password !== "string") errors.push("password is required");
  if (typeof body.password === "string" && body.password.length < 8) errors.push("password must be at least 8 characters");
  return { valid: errors.length === 0, errors };
}

export function validateChangePassword(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!body.currentPassword || typeof body.currentPassword !== "string") errors.push("currentPassword is required");
  if (!body.newPassword     || typeof body.newPassword     !== "string") errors.push("newPassword is required");
  if (typeof body.newPassword === "string" && body.newPassword.length < 8) errors.push("newPassword must be at least 8 characters");
  return { valid: errors.length === 0, errors };
}
