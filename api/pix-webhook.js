// Serverless function (Vercel) — recebe as notificacoes de webhook da SigiloPay
// (TRANSACTION_CREATED, TRANSACTION_PAID, etc). URL fixa configurada como callbackUrl
// na criacao da transacao, em api/create-pix.js.
//
// Guarda o status atualizado no Upstash; o front-end consulta esse status via
// /api/check-pix-status (que le do Upstash, nao bate na SigiloPay).
//
// Quando o evento e TRANSACTION_PAID, dispara o Purchase pra Meta Conversions API
// (server-side), usando o mesmo transactionId como event_id que o Pixel do navegador
// usa na pagina de obrigado — assim a Meta deduplica automaticamente e o Purchase
// conta uma unica vez, tenha o cliente voltado pro site ou nao.

import { kvGet, kvSet } from '../lib/kv.js';
import { sendPurchaseEvent } from '../lib/meta-capi.js';

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

  const existing = (await kvGet('pix:' + transactionId)) || {};

  // Confere o token contra o webhookToken salvo quando a transacao foi criada,
  // pra garantir que a notificacao realmente veio da SigiloPay e nao foi forjada.
  if (existing.webhookToken && existing.webhookToken !== incomingToken) {
    return res.status(401).json({ error: 'Token de webhook invalido.' });
  }

  var status = existing.status || 'PENDING';
  if (event === 'TRANSACTION_PAID') status = 'COMPLETED';
  else if (event === 'TRANSACTION_CREATED') status = 'PENDING';
  else if (event === 'TRANSACTION_REFUNDED' || event === 'TRANSACTION_CHARGEBACK') status = 'FAILED';

  const record = Object.assign({}, existing, {
    status: status,
    webhookToken: existing.webhookToken || incomingToken,
  });

  // Dispara o Purchase pro Meta CAPI uma unica vez por transacao.
  if (status === 'COMPLETED' && !record.capiPurchaseSent) {
    try {
      await sendPurchaseEvent({
        eventId: transactionId,
        value: existing.amount || transaction.amount || transaction.chargeAmount,
        email: existing.customer && existing.customer.email,
        phone: existing.customer && existing.customer.phone,
        clientIp: existing.clientIp,
        userAgent: existing.userAgent,
        fbp: existing.fbp,
        fbc: existing.fbc,
        sourceUrl: existing.sourceUrl,
      });
      record.capiPurchaseSent = true;
    } catch (err) {
      // Nao falha o webhook por causa do CAPI - o status do pedido continua sendo salvo.
    }
  }

  await kvSet('pix:' + transactionId, record, 60 * 60 * 24);

  return res.status(200).json({ received: true });
}
