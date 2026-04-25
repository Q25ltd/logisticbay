export function Alert({ type, message }: { type: "error"|"success"|"warning"|"info"; message: string }) {
  const s: Record<string,string> = { error:"bg-red-50 border-red-500 text-red-800", success:"bg-green-50 border-green-500 text-green-800", warning:"bg-yellow-50 border-yellow-500 text-yellow-800", info:"bg-blue-50 border-blue-500 text-blue-800" };
  return <div className={"border-l-4 p-3 rounded text-sm mb-4 " + s[type]}>{message}</div>;
}
