/**
 * Leitura de corpos JSON das APIs de nuvem (Dropbox).
 *
 * `Response.json()` devolve `Promise<any>`; este é o único ponto do módulo
 * `drive/` que consome esse `any`, e o devolve como `unknown`. A validação da
 * forma acontece no chamador, antes de qualquer uso.
 */
export async function parseJson(res: Response): Promise<unknown> {
  const data: unknown = await res.json();
  return data;
}
