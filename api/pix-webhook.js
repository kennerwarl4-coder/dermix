// Serverless function (Vercel) — recebe as notificacoes de webhook da SigiloPay
// (TRANSACTION_CREATED, TRANSACTION_PAID, etc). URL fixa configurada como callbackUrl
// na criacao da transacao, em api/create-pix.js.
//
// Guarda o status atualizado no Upstash; o front-end consulta esse status via
// /api/check-pix-status (que le do Upstash, nao bate na SigiloPay).

import { kvGet, kvSet } from '../lib/kv.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const body = req.body || {};
  const event = body.event;
  const transaction = body.transaction || {};
  const transactionId = transaction.id;
  const incomingToken = body.token;

  if (!transactionId) {
    return res.status(400).json({ error: 'transaction.id ausente no webhook.' });
  }

  // Confere o token contra o webhookToken salvo quando a transacao foi criada,
  // pra garantir que a notificacao realmente veio da SigiloPay e nao foi forjada.
  const existing = await kvGet('pix:' + transactionId);
  if (existing && existing.webhookToken && existing.webhookToken !== incomingToken) {
    return res.status(401).json({ error: 'Token de webhook invalido.' });
  }

  var status = (existing && existing.status) || 'PENDING';
  if (event === 'TRANSACTION_PAID') status = 'COMPLETED';
  else if (event === 'TRANSACTION_CREATED') status = 'PENDING';
  else if (event === 'TRANSACTION_REFUNDED' || event === 'TRANSACTION_CHARGEBACK') status = 'FAILED';

  await kvSet(
    'pix:' + transactionId,
    { status: status, webhookToken: (existing && existing.webhookToken) || incomingToken },
    60 * 60 * 24
  );

  return res.status(200).json({ received: true });
}
