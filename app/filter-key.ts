export function normalizeFilterKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

export function filterKeyError(key: string): string | undefined {
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(key)) {
    return "Usa de 2 a 40 caracteres: letras sin acentos, números y guion bajo. Empieza con una letra; por ejemplo, ocasion o temporada.";
  }
}
