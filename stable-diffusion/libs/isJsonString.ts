export function isJsonString(data: any) {
  if (!data) return false;
  try {
    JSON.parse(data);
  } catch (error) {
    return false;
  }
  return true;
}
