// Armazenamento chave-valor via Upstash Redis (REST API), usado para guardar o status
// de cada transacao Pix. O webhook da SigiloPay escreve aqui; o front-end le daqui
// via polling no NOSSO backend (rapido e sem limite, ao contrario de bater direto na
// API da SigiloPay).
//
// Configurar na Vercel (Project Settings > Environment Variables):
//   UPSTASH_REDIS_REST_URL = <URL do seu banco Upstash>
//   UPSTASH_REDIS_REST_TOKEN = <token REST do Upstash>
//
// Criar o banco (gratis): https://console.upstash.com -> Create Database -> aba REST API,
// copiar "UPSTASH_REDIS_REST_URL" e "UPSTASH_REDIS_REST_TOKEN".

const BASE_URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function command(cmd) {
  if (!BASE_URL || !TOKEN) {
    throw new Error('Upstash nao configurado (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).');
  }
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cmd),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

export async function kvSet(key, value, exSeconds) {
  return command(['SET', key, JSON.stringify(value), 'EX', String(exSeconds || 86400)]);
}

export async function kvGet(key) {
  const raw = await command(['GET', key]);
  return raw ? JSON.parse(raw) : null;
}
